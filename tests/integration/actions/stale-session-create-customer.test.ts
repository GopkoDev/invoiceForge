// T44 (spec.md §5 AC-21, review-2026-09-28 N-03) — test-plan.md row "a session whose account is
// gone is treated as signed out": the one path the earlier tests left open is the whole chain.
// `getAuthenticatedUser` trusts `session.user.id`, so this drives a stale token through the REAL
// `sessionCallback` (lib/helpers/session-callback.ts, the exact function auth.ts wires into
// NextAuth) against a real database, hands the resulting session to the real `createCustomer`
// server action, and asserts UNAUTHORIZED with 0 customer rows written.
//
// Seam: same-process app code (tests/README.md option 1). '@/auth' is mocked so that `auth()`
// is built from `sessionCallback` for a token naming a deleted account, the way NextAuth's jwt
// strategy would call it; everything downstream of `auth()` is production code.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// The token a browser still holds after its account was deleted (set per test).
let staleTokenId: string | undefined;

vi.mock('@/auth', () => ({
  auth: async () => {
    const { sessionCallback } = await import('@/lib/helpers/session-callback');
    // next-auth seeds session.user from the token's profile claims but never with an id.
    return sessionCallback({
      session: {
        user: { name: 'Gone', email: 'gone@example.test' },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token: { id: staleTokenId },
    });
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> };
type CreateCustomer = (data: { name: string; defaultCurrency: string }) => Promise<ActionResult<{ id: string }>>;

describe.runIf(containerRuntimeAvailable)('stale session vs createCustomer — real callback, real DB (T44, AC-21, N-03)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let createCustomer: CreateCustomer;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    ({ createCustomer } = (await import('@/lib/actions/customer-actions')) as unknown as {
      createCustomer: CreateCustomer;
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('AC-21: a token for a deleted account is refused as UNAUTHORIZED and writes 0 customers', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'stale-session@example.test' });
    staleTokenId = freelancer.id;
    await prisma.user.delete({ where: { id: freelancer.id } });

    const result = await createCustomer({ name: 'Ghost Customer', defaultCurrency: 'USD' });

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(await prisma.customer.count()).toBe(0);
  });

  it('contrast: the same chain with a live account creates the customer', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'live-session@example.test' });
    staleTokenId = freelancer.id;

    const result = await createCustomer({ name: 'Real Customer', defaultCurrency: 'USD' });

    expect(result.success).toBe(true);
    expect(await prisma.customer.count({ where: { userId: freelancer.id } })).toBe(1);
  });
});

describe.runIf(!containerRuntimeAvailable)('stale session vs createCustomer (T44)', () => {
  it.skip('skipped: no container runtime', () => {});
});
