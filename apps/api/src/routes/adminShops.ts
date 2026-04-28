/**
 * Admin Shop & Resource Routes
 * ─────────────────────────────
 * All routes require requireAdmin.
 *
 * GET    /api/admin/shops                         — list all shops with resources
 * POST   /api/admin/shops                         — create shop
 * PATCH  /api/admin/shops/:id                     — update shop fields
 * DELETE /api/admin/shops/:id                     — delete shop (cascades to resources)
 * POST   /api/admin/shops/:shopId/resources       — add resource to shop
 * PATCH  /api/admin/resources/:id                 — update resource fields
 * DELETE /api/admin/resources/:id                 — delete resource
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const ShopBodySchema = z.object({
  name:              z.string().min(1).max(100),
  slug:              z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  description:       z.string().max(500).optional(),
  guildSlackChannel: z.string().max(100).optional(),
  gcalCalendarId:    z.string().max(200).optional(),
});

const ResourceBodySchema = z.object({
  name:                   z.string().min(1).max(100),
  description:            z.string().max(500).optional(),
  requiredCertifications: z.array(z.string()).optional(),
  cooldownHours:          z.number().int().min(0).optional(),
  isHighDemand:           z.boolean().optional(),
  bookingWindowDays:      z.number().int().min(1).max(365).optional(),
  showOnKiosk:            z.boolean().optional(),
});

const adminShopsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireAdmin);

  // ── GET /api/admin/shops ──────────────────────────────────────────────────
  fastify.get('/api/admin/shops', async (_req, reply) => {
    const shops = await fastify.prisma.shop.findMany({
      orderBy: { name: 'asc' },
      include: {
        resources: { orderBy: { name: 'asc' } },
      },
    });
    reply.send(shops);
  });

  // ── POST /api/admin/shops ─────────────────────────────────────────────────
  fastify.post<{ Body: unknown }>('/api/admin/shops', async (req, reply) => {
    const parsed = ShopBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid shop data.', details: parsed.error.flatten() });
      return;
    }
    const { name, slug, description, guildSlackChannel, gcalCalendarId } = parsed.data;

    const existing = await fastify.prisma.shop.findUnique({ where: { slug } });
    if (existing) {
      reply.code(409).send({ code: 'SLUG_CONFLICT', message: `A shop with slug "${slug}" already exists.` });
      return;
    }

    const shop = await fastify.prisma.shop.create({
      data: {
        name,
        slug,
        ...(description       ? { description }       : {}),
        ...(guildSlackChannel ? { guildSlackChannel } : {}),
        ...(gcalCalendarId    ? { gcalCalendarId }    : {}),
      },
      include: { resources: true },
    });
    reply.code(201).send(shop);
  });

  // ── PATCH /api/admin/shops/:id ────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/admin/shops/:id',
    async (req, reply) => {
      const parsed = ShopBodySchema.partial().safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid shop data.', details: parsed.error.flatten() });
        return;
      }

      const shop = await fastify.prisma.shop.findUnique({ where: { id: req.params.id } });
      if (!shop) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Shop not found.' });
        return;
      }

      const { name, slug, description, guildSlackChannel, gcalCalendarId } = parsed.data;
      if (slug && slug !== shop.slug) {
        const conflict = await fastify.prisma.shop.findUnique({ where: { slug } });
        if (conflict) {
          reply.code(409).send({ code: 'SLUG_CONFLICT', message: `A shop with slug "${slug}" already exists.` });
          return;
        }
      }
      const updated = await fastify.prisma.shop.update({
        where: { id: req.params.id },
        data: {
          ...(name              !== undefined ? { name }              : {}),
          ...(slug              !== undefined ? { slug }              : {}),
          ...(description       !== undefined ? { description }       : {}),
          ...(guildSlackChannel !== undefined ? { guildSlackChannel } : {}),
          ...(gcalCalendarId    !== undefined ? { gcalCalendarId }    : {}),
        },
        include: { resources: { orderBy: { name: 'asc' } } },
      });
      reply.send(updated);
    },
  );

  // ── DELETE /api/admin/shops/:id ───────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/shops/:id',
    async (req, reply) => {
      const shop = await fastify.prisma.shop.findUnique({ where: { id: req.params.id } });
      if (!shop) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Shop not found.' });
        return;
      }
      // Cascade delete is defined in schema (onDelete: Cascade on Resource.shopId)
      await fastify.prisma.shop.delete({ where: { id: req.params.id } });
      reply.send({ ok: true });
    },
  );

  // ── POST /api/admin/shops/:shopId/resources ───────────────────────────────
  fastify.post<{ Params: { shopId: string }; Body: unknown }>(
    '/api/admin/shops/:shopId/resources',
    async (req, reply) => {
      const shop = await fastify.prisma.shop.findUnique({ where: { id: req.params.shopId } });
      if (!shop) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Shop not found.' });
        return;
      }

      const parsed = ResourceBodySchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid resource data.', details: parsed.error.flatten() });
        return;
      }
      const { name, description, requiredCertifications, cooldownHours, isHighDemand, bookingWindowDays, showOnKiosk } = parsed.data;

      const resource = await fastify.prisma.resource.create({
        data: {
          shopId:                 req.params.shopId,
          name,
          ...(description             !== undefined ? { description }             : {}),
          ...(requiredCertifications  !== undefined ? { requiredCertifications }  : {}),
          ...(cooldownHours           !== undefined ? { cooldownHours }           : {}),
          ...(isHighDemand            !== undefined ? { isHighDemand }            : {}),
          ...(bookingWindowDays       !== undefined ? { bookingWindowDays }       : {}),
          ...(showOnKiosk             !== undefined ? { showOnKiosk }             : {}),
        },
      });
      reply.code(201).send(resource);
    },
  );

  // ── PATCH /api/admin/resources/:id ───────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/admin/resources/:id',
    async (req, reply) => {
      const resource = await fastify.prisma.resource.findUnique({ where: { id: req.params.id } });
      if (!resource) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Resource not found.' });
        return;
      }

      const parsed = ResourceBodySchema.partial().safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid resource data.', details: parsed.error.flatten() });
        return;
      }

      const { name, description, requiredCertifications, cooldownHours, isHighDemand, bookingWindowDays, showOnKiosk } = parsed.data;
      const updated = await fastify.prisma.resource.update({
        where: { id: req.params.id },
        data: {
          ...(name                   !== undefined ? { name }                   : {}),
          ...(description            !== undefined ? { description }            : {}),
          ...(requiredCertifications !== undefined ? { requiredCertifications } : {}),
          ...(cooldownHours          !== undefined ? { cooldownHours }          : {}),
          ...(isHighDemand           !== undefined ? { isHighDemand }           : {}),
          ...(bookingWindowDays      !== undefined ? { bookingWindowDays }      : {}),
          ...(showOnKiosk            !== undefined ? { showOnKiosk }            : {}),
        },
      });
      reply.send(updated);
    },
  );

  // ── DELETE /api/admin/resources/:id ──────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/resources/:id',
    async (req, reply) => {
      const resource = await fastify.prisma.resource.findUnique({ where: { id: req.params.id } });
      if (!resource) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Resource not found.' });
        return;
      }
      await fastify.prisma.resource.delete({ where: { id: req.params.id } });
      reply.send({ ok: true });
    },
  );
};

export default adminShopsRoutes;
