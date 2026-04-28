/**
 * No-Show Worker (BullMQ)
 * ───────────────────────
 * When a booking is CONFIRMED, a delayed job is enqueued for
 * (startsAt + grace_period). The processor checks whether the member
 * has checked in; if not, it transitions the booking to NO_SHOW,
 * DMs the member, and posts a guild alert.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@makenashville/db';
import { BOOKING_POLICY } from '@makenashville/shared';
import { markNoShow } from '../services/booking.js';
import { env } from '../env.js';

const QUEUE_NAME = 'noshow';

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200 },
    });
  }
  return _queue;
}

/**
 * Schedule a no-show check for `bookingId`.
 * The job fires at `startsAt + NO_SHOW_GRACE_MINUTES`.
 */
export async function scheduleNoShowCheck(
  bookingId: string,
  startsAt: Date,
): Promise<void> {
  const graceMs = BOOKING_POLICY.NO_SHOW_GRACE_MINUTES * 60_000;
  const fireAt = startsAt.getTime() + graceMs;
  const delay = Math.max(0, fireAt - Date.now());

  await getQueue().add(
    'check',
    { bookingId },
    {
      delay,
      jobId: `noshow-${bookingId}`, // idempotent: won't double-enqueue
    },
  );
}

/**
 * Remove a scheduled no-show job (called when the booking is cancelled
 * or the member checks in before the timer fires).
 */
export async function cancelNoShowCheck(bookingId: string): Promise<void> {
  const job = await getQueue().getJob(`noshow-${bookingId}`);
  await job?.remove();
}

/** Start the worker. Call this once at server startup. */
export function startNoShowWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<{ bookingId: string }>) => {
      const { bookingId } = job.data;
      const booking = await markNoShow(prisma, bookingId);

      if (!booking) {
        // Already checked in or cancelled — nothing to do
        return;
      }

      // Lazy-import to avoid circular dependencies
      const { notifyNoShow } = await import('../services/slack.js');
      await notifyNoShow(booking);
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[noshow-worker] Job ${job?.id} failed:`, err);
  });

  return worker;
}
