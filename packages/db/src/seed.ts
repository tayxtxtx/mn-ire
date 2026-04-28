import { PrismaClient } from './generated/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Shops ──────────────────────────────────────────────────────────────────

  const woodshop = await prisma.shop.upsert({
    where: { slug: 'woodshop' },
    update: {},
    create: {
      name: 'Woodshop',
      slug: 'woodshop',
      description: 'Table saws, band saws, jointers, planers, and hand tools.',
      guildSlackChannel: '#woodshop-captains',
    },
  });

  const metalshop = await prisma.shop.upsert({
    where: { slug: 'metalshop' },
    update: {},
    create: {
      name: 'Metal Shop',
      slug: 'metalshop',
      description: 'Lathes, mills, grinders, and welding stations.',
      guildSlackChannel: '#metal-captains',
    },
  });

  const cncShop = await prisma.shop.upsert({
    where: { slug: 'cnc' },
    update: {},
    create: {
      name: 'CNC Lab',
      slug: 'cnc',
      description: 'CNC routers and plasma cutting.',
      guildSlackChannel: '#cnc-captains',
    },
  });

  const laserShop = await prisma.shop.upsert({
    where: { slug: 'laser' },
    update: {},
    create: {
      name: 'Laser Lab',
      slug: 'laser',
      description: 'CO₂ and fiber laser cutters / engravers.',
      guildSlackChannel: '#laser-captains',
    },
  });

  const electronicsShop = await prisma.shop.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: {
      name: 'Electronics Lab',
      slug: 'electronics',
      description: 'Soldering stations, oscilloscopes, and PCB tools.',
      guildSlackChannel: '#electronics-captains',
    },
  });

  // ── Resources ─────────────────────────────────────────────────────────────

  await prisma.resource.upsert({
    where: { id: 'res-table-saw' },
    update: {},
    create: {
      id: 'res-table-saw',
      shopId: woodshop.id,
      name: 'SawStop Table Saw',
      description: '10" professional cabinet saw with SawStop flesh-detection.',
      requiredCertifications: ['woodshop_basic'],

      cooldownHours: 0,
      isHighDemand: false,
    },
  });

  await prisma.resource.upsert({
    where: { id: 'res-metal-lathe' },
    update: {},
    create: {
      id: 'res-metal-lathe',
      shopId: metalshop.id,
      name: 'Grizzly Metal Lathe',
      description: '12×36" metal lathe.',
      requiredCertifications: ['metal_lathe'],

      cooldownHours: 0,
      isHighDemand: false,
    },
  });

  await prisma.resource.upsert({
    where: { id: 'res-cnc-router' },
    update: {},
    create: {
      id: 'res-cnc-router',
      shopId: cncShop.id,
      name: 'Avid CNC Router (4×8)',
      description: '4×8 ft PRO4848 gantry router.',
      requiredCertifications: ['cnc_basic'],

      cooldownHours: 4,
      isHighDemand: true,
    },
  });

  await prisma.resource.upsert({
    where: { id: 'res-laser-60w' },
    update: {},
    create: {
      id: 'res-laser-60w',
      shopId: laserShop.id,
      name: 'Thunder Laser Nova 35 (60W)',
      description: '60W CO₂ laser, 35×24" bed.',
      requiredCertifications: ['laser_certified'],

      cooldownHours: 4,
      isHighDemand: true,
    },
  });

  await prisma.resource.upsert({
    where: { id: 'res-soldering' },
    update: {},
    create: {
      id: 'res-soldering',
      shopId: electronicsShop.id,
      name: 'Soldering Station (×4)',
      description: 'Hakko FX-888D stations — any of 4 benches.',
      requiredCertifications: ['electronics_basic'],

      cooldownHours: 0,
      isHighDemand: false,
    },
  });

  // ── Demo User ──────────────────────────────────────────────────────────────

  await prisma.user.upsert({
    where: { authentikId: 'dev-demo-user' },
    update: {},
    create: {
      authentikId: 'dev-demo-user',
      email: 'demo@makenashville.org',
      displayName: 'Demo Member',
      certifications: [
        'woodshop_basic',
        'cnc_basic',
        'laser_certified',
        'electronics_basic',
      ],
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
