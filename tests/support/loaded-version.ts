// invoice-integrity T08 (AC-10): updateInvoice requires the version the editor loaded. A test that is
// not about concurrency saves as an editor opened just now would: with the row's current version.
// A caller that passes its own loadedVersion keeps it.
import type { PrismaClient } from '@prisma/client';

export async function currentVersion(prisma: PrismaClient, id: string): Promise<number> {
  return (await prisma.invoice.findUnique({ where: { id }, select: { version: true } }))?.version ?? 0;
}

export async function withLoadedVersion<T extends object>(
  prisma: PrismaClient,
  id: string,
  data: T
): Promise<T & { loadedVersion: number }> {
  return { loadedVersion: await currentVersion(prisma, id), ...data } as T & { loadedVersion: number };
}
