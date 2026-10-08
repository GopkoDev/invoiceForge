// Forces a write to lose a race it would normally never lose (invoice-integrity T29, ADR-0005): a side
// transaction on another connection writes WITHOUT the service's lock and stays open; the service call
// starts and blocks on a row the side transaction holds; only then does the side transaction commit,
// so the service resumes against data that changed under it.
import type { Prisma, PrismaClient } from '@prisma/client';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves once some backend of this database waits on a lock; throws after `timeoutMs`. */
export async function waitForLockWait(prisma: PrismaClient, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (waiting > 0) return;
    await pause(25);
  }
  throw new Error(`no backend blocked on a lock within ${timeoutMs}ms`);
}

/**
 * Runs `sideWrite` in a transaction that stays open, starts `call`, waits until it is blocked on a
 * lock, commits the side transaction, and returns what `call` resolves to.
 */
export async function commitWhileBlocked<T>(
  prisma: PrismaClient,
  sideWrite: (tx: Prisma.TransactionClient) => Promise<unknown>,
  call: () => Promise<T>,
): Promise<T> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let written!: () => void;
  let writeFailed!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    written = resolve;
    writeFailed = reject;
  });

  const side = prisma
    .$transaction(
      async (tx) => {
        await sideWrite(tx);
        written();
        await released;
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
    .catch((error: unknown) => {
      writeFailed(error);
      throw error;
    });

  await ready;
  const pending = call();
  try {
    await waitForLockWait(prisma);
  } finally {
    release();
    await side;
  }
  return pending;
}
