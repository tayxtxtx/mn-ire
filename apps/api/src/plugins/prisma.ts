import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@mn-ire/db';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin, { name: 'prisma' });
