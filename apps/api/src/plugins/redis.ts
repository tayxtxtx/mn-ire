import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  await redis.connect();

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
};

export default fp(redisPlugin, { name: 'redis' });
