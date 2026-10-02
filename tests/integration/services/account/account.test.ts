// T11 (spec.md §5 AC-04, AC-20; sad.md §6 flow 10; public-api.md §1.4, §2.7, §2.8) — request-free
// integration tests for lib/services/account and lib/services/profile against a throwaway
// Postgres. No session, no next/cache: the functions take an ActingFreelancer and return
// ActionResult (`success` discriminant).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createCustomer } from '../../../support/factories/customer';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createProduct } from '../../../support/factories/product';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFixedClock } from '../../../support/clock';
import { createLimitEvent } from '../../../support/factories/limit-event';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const captureExceptionMock = vi.fn();
const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
}));

describe.runIf(containerRuntimeAvailable)('account + profile services — request-free (T11)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let account: typeof import('@/lib/services/account/account');
  let profile: typeof import('@/lib/services/profile/profile');
  let setup: typeof import('@/lib/services/profile/setup-check');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    account = await import('@/lib/services/account/account');
    profile = await import('@/lib/services/profile/profile');
    setup = await import('@/lib/services/profile/setup-check');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    captureExceptionMock.mockReset();
    captureMessageMock.mockReset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  async function fullAccount(prefix: string) {
    const freelancer = await createFreelancer(prisma);
    const senderProfile = await createSenderProfile(prisma, freelancer.id, { invoicePrefix: prefix });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, freelancer.id);
    const product = await createProduct(prisma, freelancer.id);
    await createInvoice(prisma, { senderProfile, customer, bankAccount });
    await createInvoice(prisma, {
      senderProfile,
      customer,
      bankAccount,
      overrides: { invoiceNumber: `${prefix}-0002` },
    });
    await prisma.verificationToken.create({
      data: { identifier: freelancer.email, token: `tok-${freelancer.id}`, expires: new Date(Date.now() + 3600_000) },
    });
    await prisma.emailHistory.create({
      data: { userId: freelancer.id, oldEmail: 'old@example.com', newEmail: freelancer.email, reason: 'seed' },
    });
    return { freelancer, senderProfile, bankAccount, customer, product };
  }

  async function counts(userId: string, email: string) {
    return {
      user: await prisma.user.count({ where: { id: userId } }),
      emailHistory: await prisma.emailHistory.count({ where: { userId } }),
      senderProfile: await prisma.senderProfile.count({ where: { userId } }),
      bankAccount: await prisma.bankAccount.count({ where: { senderProfile: { userId } } }),
      customer: await prisma.customer.count({ where: { userId } }),
      product: await prisma.product.count({ where: { userId } }),
      invoice: await prisma.invoice.count({ where: { senderProfile: { userId } } }),
      verificationToken: await prisma.verificationToken.count({ where: { identifier: email } }),
    };
  }

  it('getAccountDeletionSummary: counts only the actor invoices', async () => {
    const a = await fullAccount('AAA');
    await fullAccount('BBB');
    const actor = await actingFreelancerForTest(a.freelancer.id);
    const result = await account.getAccountDeletionSummary(actor);
    expect(result).toEqual({ success: true, data: { invoiceCount: 2 } });
  });

  it('getAccountDeletionSummary: an unreachable store is FAILED, reported once (AC-04)', async () => {
    const a = await fullAccount('AAA');
    const actor = await actingFreelancerForTest(a.freelancer.id);
    const { prisma: appPrisma } = await import('@/prisma');
    vi.spyOn(appPrisma.invoice, 'count').mockRejectedValue(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await account.getAccountDeletionSummary(actor);
    expect(result).toMatchObject({ success: false, code: 'FAILED', error: 'Something went wrong. Please try again.' });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('deleteAccount: removes every owned row and the VerificationToken rows, leaves B intact', async () => {
    const a = await fullAccount('AAA');
    const b = await fullAccount('BBB');
    const actor = await actingFreelancerForTest(a.freelancer.id);

    const result = await account.deleteAccount(actor);

    expect(result.success).toBe(true);
    expect(await counts(a.freelancer.id, a.freelancer.email)).toEqual({
      user: 0, emailHistory: 0, senderProfile: 0, bankAccount: 0, customer: 0, product: 0, invoice: 0, verificationToken: 0,
    });
    expect(await counts(b.freelancer.id, b.freelancer.email)).toMatchObject({ user: 1, invoice: 2, verificationToken: 1 });
  });

  it('deleteAccount: a failure partway through removes nothing, FAILED, reported once (AC-20, AC-04)', async () => {
    const a = await fullAccount('AAA');
    const before = await counts(a.freelancer.id, a.freelancer.email);
    const actor = await actingFreelancerForTest(a.freelancer.id);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION t11_fail_on_marked_profile() RETURNS TRIGGER AS $$
      BEGIN
        IF OLD."userId" = '${a.freelancer.id}' THEN
          RAISE EXCEPTION 'T11 forced mid-transaction failure';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER t11_trg_fail_on_marked_profile
      BEFORE DELETE ON "SenderProfile"
      FOR EACH ROW EXECUTE FUNCTION t11_fail_on_marked_profile();
    `);
    try {
      const result = await account.deleteAccount(actor);
      expect(result).toMatchObject({
        success: false,
        code: 'FAILED',
        error: "Your account couldn't be deleted. Nothing was removed.",
      });
      expect(await counts(a.freelancer.id, a.freelancer.email)).toEqual(before);
      expect(before.invoice).toBe(2);
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS t11_trg_fail_on_marked_profile ON "SenderProfile"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS t11_fail_on_marked_profile()`);
    }
  });

  it('tenant gone: deleteAccount, updateProfile and getAccountExport return NOT_FOUND "Account not found."', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    await prisma.user.delete({ where: { id: a.id } });

    const del = await account.deleteAccount(actor);
    const upd = await profile.updateProfile(actor, { name: 'Name', email: 'gone@example.com' });
    const exp = await account.getAccountExport(actor);

    for (const r of [del, upd, exp]) {
      expect(r).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Account not found.' });
    }
  });

  it('getAccountExport: A only, exportVersion 2.0, B data absent', async () => {
    const a = await fullAccount('AAA');
    const b = await fullAccount('BBB');
    const actor = await actingFreelancerForTest(a.freelancer.id);

    const result = await account.getAccountExport(actor);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data;
    expect(data.exportVersion).toBe('2.0');
    expect(data.user.id).toBe(a.freelancer.id);
    expect(data.senderProfiles.map((p) => p.id)).toEqual([a.senderProfile.id]);
    expect(data.senderProfiles[0].bankAccounts).toHaveLength(1);
    expect(data.customers.map((c) => c.id)).toEqual([a.customer.id]);
    expect(data.products.map((p) => p.id)).toEqual([a.product.id]);
    expect(data.invoices).toHaveLength(2);
    expect(data.emailHistory).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(b.freelancer.id);
    expect(typeof data.exportDate).toBe('string');
  });

  // --- T13 (security-patch, AC-23/24/25; ADR-0005). Seam assumed:
  //   getAccountExport(actor, overrides?: { clock?: Clock })  - the clock is handed to the limit store.
  const T0 = new Date('2026-10-02T12:00:00.000Z');
  const HOUR = 3_600_000;

  async function exportRows(userId: string) {
    return prisma.limitEvent.findMany({ where: { scope: 'EXPORT', key: userId }, orderBy: { at: 'asc' } });
  }

  it('AC-23: with fewer than 3 counted exports the Freelancer receives the file and one STARTED row is recorded', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const clock = createFixedClock(T0);

    const result = await account.getAccountExport(actor, { clock });

    expect(result.success).toBe(true);
    const rows = await exportRows(a.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'STARTED', userId: a.id, key: a.id });
  });

  it('AC-24: the 4th export in the hour is RATE_LIMITED with retryAt = oldest start + 1 h, and nothing is read', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const clock = createFixedClock(T0);
    for (let i = 0; i < 3; i++) {
      expect((await account.getAccountExport(actor, { clock })).success).toBe(true);
      clock.advance(10 * 60_000);
    }
    const { prisma: appPrisma } = await import('@/prisma');
    const readSpy = vi.spyOn(appPrisma.customer, 'findMany');

    const result = await account.getAccountExport(actor, { clock });

    expect(result).toMatchObject({
      success: false,
      code: 'RATE_LIMITED',
      error: "You've reached the export limit. You can export again later.",
      details: { kind: 'RETRY_AT', retryAt: new Date(T0.getTime() + HOUR).toISOString() },
    });
    expect(readSpy).not.toHaveBeenCalled();
    expect(await exportRows(a.id)).toHaveLength(3);
  });

  it('AC-24: once the oldest start leaves the window the Freelancer can export again', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const clock = createFixedClock(T0);
    for (let i = 0; i < 3; i++) await account.getAccountExport(actor, { clock });
    clock.set(new Date(T0.getTime() + HOUR + 1));

    const result = await account.getAccountExport(actor, { clock });

    expect(result.success).toBe(true);
  });

  it('AC-24: a system-side read failure flips the row to FAILED and frees the place', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const clock = createFixedClock(T0);
    await account.getAccountExport(actor, { clock });
    await account.getAccountExport(actor, { clock });
    const { prisma: appPrisma } = await import('@/prisma');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(appPrisma.customer, 'findMany').mockRejectedValueOnce(new Error('connection terminated'));

    const failed = await account.getAccountExport(actor, { clock });

    expect(failed).toMatchObject({ success: false, code: 'FAILED', error: "Your data couldn't be exported. Try again." });
    const rows = await exportRows(a.id);
    expect(rows.map((r) => r.outcome).sort()).toEqual(['FAILED', 'STARTED', 'STARTED']);
    // The failed run no longer counts: a further export is allowed, the one after is refused.
    expect((await account.getAccountExport(actor, { clock })).success).toBe(true);
    expect(await account.getAccountExport(actor, { clock })).toMatchObject({ success: false, code: 'RATE_LIMITED' });
  });

  it('AC-24: a produced export that the Freelancer abandons still counts (no flip to FAILED)', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const clock = createFixedClock(T0);
    for (let i = 0; i < 3; i++) await account.getAccountExport(actor, { clock });

    expect((await exportRows(a.id)).map((r) => r.outcome)).toEqual(['STARTED', 'STARTED', 'STARTED']);
  });

  it('AC-24: 5 concurrent requests run exactly 3 exports and refuse 2', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const clock = createFixedClock(T0);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => account.getAccountExport(actor, { clock })),
    );

    expect(results.filter((r) => r.success)).toHaveLength(3);
    expect(results.filter((r) => !r.success && r.code === 'RATE_LIMITED')).toHaveLength(2);
    expect(await exportRows(a.id)).toHaveLength(3);
  });

  it('AC-25: one Freelancer at the limit does not affect another', async () => {
    const a = await createFreelancer(prisma);
    const b = await createFreelancer(prisma);
    const clock = createFixedClock(T0);
    for (let i = 0; i < 3; i++) {
      await createLimitEvent(prisma, { scope: 'EXPORT', key: a.id, userId: a.id, outcome: 'STARTED', at: T0 });
    }
    const actorA = await actingFreelancerForTest(a.id);
    const actorB = await actingFreelancerForTest(b.id);

    expect(await account.getAccountExport(actorA, { clock })).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect((await account.getAccountExport(actorB, { clock })).success).toBe(true);
  });

  it('AC-24: an unavailable limit store is FAILED and nothing is read (never unlimited)', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const { prisma: appPrisma } = await import('@/prisma');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(appPrisma, '$transaction').mockRejectedValue(new Error('connection refused'));
    const readSpy = vi.spyOn(appPrisma.customer, 'findMany');

    const result = await account.getAccountExport(actor, { clock: createFixedClock(T0) });

    expect(result).toMatchObject({ success: false, code: 'FAILED', error: "Your data couldn't be exported. Try again." });
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('account gone: getAccountExport is NOT_FOUND, records no EXPORT row and reports no limit-store outage', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    await prisma.user.delete({ where: { id: a.id } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await account.getAccountExport(actor, { clock: createFixedClock(T0) });

    expect(result).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Account not found.' });
    expect(await exportRows(a.id)).toHaveLength(0);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('account vanishes mid-export: NOT_FOUND and the reserved place is released (row flips to FAILED)', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const { prisma: appPrisma } = await import('@/prisma');
    // The data read selects the user's email; return null there to simulate a delete racing the read.
    const original = appPrisma.user.findUnique.bind(appPrisma.user);
    vi.spyOn(appPrisma.user, 'findUnique').mockImplementation(((args: { select?: { email?: boolean } }) =>
      args.select?.email ? Promise.resolve(null) : original(args as never)) as never);

    const result = await account.getAccountExport(actor, { clock: createFixedClock(T0) });

    expect(result).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Account not found.' });
    expect((await exportRows(a.id)).map((r) => r.outcome)).toEqual(['FAILED']);
  });

  it('updateProfile: an email change updates the user and writes one EmailHistory row', async () => {
    const a = await createFreelancer(prisma, { email: 'before@example.com' });
    const actor = await actingFreelancerForTest(a.id);

    const result = await profile.updateProfile(actor, { name: 'New Name', email: 'after@example.com', image: '' });

    expect(result.success).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(user).toMatchObject({ name: 'New Name', email: 'after@example.com', image: null });
    const history = await prisma.emailHistory.findMany({ where: { userId: a.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ oldEmail: 'before@example.com', newEmail: 'after@example.com' });
  });

  it('updateProfile: an unchanged email writes no EmailHistory row', async () => {
    const a = await createFreelancer(prisma, { email: 'same@example.com' });
    const actor = await actingFreelancerForTest(a.id);
    const result = await profile.updateProfile(actor, { name: 'Renamed', email: 'same@example.com' });
    expect(result.success).toBe(true);
    expect(await prisma.emailHistory.count({ where: { userId: a.id } })).toBe(0);
  });

  it("updateProfile: another account's email is CONFLICT and nothing is written", async () => {
    const a = await createFreelancer(prisma, { email: 'a@example.com', name: 'Original' });
    await createFreelancer(prisma, { email: 'taken@example.com' });
    const actor = await actingFreelancerForTest(a.id);

    const result = await profile.updateProfile(actor, { name: 'Changed', email: 'taken@example.com' });

    expect(result).toMatchObject({
      success: false,
      code: 'CONFLICT',
      error: 'This email is already in use by another account.',
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(user).toMatchObject({ name: 'Original', email: 'a@example.com' });
    expect(await prisma.emailHistory.count({ where: { userId: a.id } })).toBe(0);
  });

  it('updateProfile: an invalid email is VALIDATION with fieldErrors', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const result = await profile.updateProfile(actor, { name: 'Name', email: 'not-an-email' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('VALIDATION');
    expect(result.fieldErrors?.email).toBeDefined();
  });

  it('checkSetup: counts the actor rows; isComplete ignores products', async () => {
    const a = await createFreelancer(prisma);
    await fullAccount('BBB');
    const actor = await actingFreelancerForTest(a.id);

    expect(await setup.checkSetup(actor)).toEqual({
      success: true,
      data: { hasSenderProfiles: false, hasBankAccounts: false, hasCustomers: false, hasProducts: false, isComplete: false },
    });

    const sp = await createSenderProfile(prisma, a.id);
    await createBankAccount(prisma, sp.id);
    await createCustomer(prisma, a.id);
    expect(await setup.checkSetup(actor)).toEqual({
      success: true,
      data: { hasSenderProfiles: true, hasBankAccounts: true, hasCustomers: true, hasProducts: false, isComplete: true },
    });
  });
});

describe.runIf(!containerRuntimeAvailable)('account + profile services (T11)', () => {
  it.skip('skipped: no container runtime', () => {});
});
