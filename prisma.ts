import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });

// errorFormat 'minimal' only drops the colored/pretty rendering; the error message still embeds the
// call arguments. Keeping them out of Sentry is done by beforeSend/beforeBreadcrumb in
// sentry.server.config.ts, not by this option.
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter, errorFormat: 'minimal' });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
