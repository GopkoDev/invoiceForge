// T9 (spec.md §5 AC-08, AC-17; sad.md §6 flows 4 and 9; public-api.md §2.4) — request-free
// integration tests for lib/services/sender-profiles against a throwaway Postgres. No session, no
// next/cache: the functions take an ActingFreelancer and return ActionResult.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createCustomer } from '../../../support/factories/customer';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)('sender-profiles service — request-free (T9)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: typeof import('@/lib/services/sender-profiles/sender-profiles');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/sender-profiles/sender-profiles');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  const formValues = (over: Record<string, unknown> = {}) => ({
    name: 'Acme Studio',
    invoicePrefix: 'ACME',
    isDefault: false,
    ...over,
  });

  async function ownerGraph() {
    const freelancer = await createFreelancer(prisma);
    const senderProfile = await createSenderProfile(prisma, freelancer.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, freelancer.id);
    return { freelancer, senderProfile, bankAccount, customer };
  }

  it('list: searches name and legalName in any case, scoped to the owner', async () => {
    const a = await createFreelancer(prisma);
    const b = await createFreelancer(prisma);
    await createSenderProfile(prisma, a.id, { name: 'Alpha Studio', isDefault: false });
    await createSenderProfile(prisma, a.id, { name: 'Other', legalName: 'ALPHA Holdings', isDefault: false });
    await createSenderProfile(prisma, a.id, { name: 'Beta', isDefault: false });
    await createSenderProfile(prisma, b.id, { name: 'Alpha of B', isDefault: false });
    const actor = await actingFreelancerForTest(a.id);

    const result = await svc.listSenderProfiles(actor, { search: 'alpha' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items.map((p) => p.name).sort()).toEqual(['Alpha Studio', 'Other']);
    expect(result.data.total).toBe(2);
    expect(result.data.items[0]._count).toEqual({ invoices: 0, bankAccounts: 0 });
  });

  it("list: full list in today's order (default first, then updatedAt desc, then id)", async () => {
    const a = await createFreelancer(prisma);
    const older = await createSenderProfile(prisma, a.id, { name: 'Older', isDefault: false });
    const newer = await createSenderProfile(prisma, a.id, { name: 'Newer', isDefault: false });
    const def = await createSenderProfile(prisma, a.id, { name: 'Default', isDefault: true });
    await prisma.senderProfile.update({ where: { id: older.id }, data: { updatedAt: new Date('2020-01-01') } });
    await prisma.senderProfile.update({ where: { id: newer.id }, data: { updatedAt: new Date('2025-01-01') } });
    const actor = await actingFreelancerForTest(a.id);

    const result = await svc.listSenderProfiles(actor);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items.map((p) => p.id)).toEqual([def.id, newer.id, older.id]);
  });

  it('list: an invalid query is VALIDATION and returns no records', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const result = await svc.listSenderProfiles(actor, { page: 0 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('VALIDATION');
  });

  it('get: returns the owned profile with counts', async () => {
    const o = await ownerGraph();
    const actor = await actingFreelancerForTest(o.freelancer.id);
    const result = await svc.getSenderProfile(actor, o.senderProfile.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBe(o.senderProfile.id);
    expect(result.data._count.bankAccounts).toBe(1);
  });

  it('get: an unknown id is NOT_FOUND "Sender profile not found."', async () => {
    const a = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(a.id);
    const result = await svc.getSenderProfile(actor, 'does-not-exist');
    expect(result).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' });
  });

  it('getSenderProfileLogo: returns the logo, or null when the profile has none', async () => {
    const a = await createFreelancer(prisma);
    const withLogo = await createSenderProfile(prisma, a.id, { logo: 'https://example.com/l.png', isDefault: false });
    const noLogo = await createSenderProfile(prisma, a.id, { isDefault: false });
    const actor = await actingFreelancerForTest(a.id);

    expect(await svc.getSenderProfileLogo(actor, withLogo.id)).toEqual({
      success: true,
      data: { logo: 'https://example.com/l.png' },
    });
    expect(await svc.getSenderProfileLogo(actor, noLogo.id)).toEqual({ success: true, data: { logo: null } });
    expect(await svc.getSenderProfileLogo(actor, 'nope')).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('create: persists for the actor, and an existing default is demoted when the new one is default', async () => {
    const a = await createFreelancer(prisma);
    const existing = await createSenderProfile(prisma, a.id, { isDefault: true });
    const actor = await actingFreelancerForTest(a.id);

    const result = await svc.createSenderProfile(actor, formValues({ isDefault: true }));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.userId).toBe(a.id);
    expect((await prisma.senderProfile.findUniqueOrThrow({ where: { id: existing.id } })).isDefault).toBe(false);
  });

  it('create: VALIDATION for a non-https logo; CONFLICT for a taken prefix', async () => {
    const a = await createFreelancer(prisma);
    const taken = await createSenderProfile(prisma, a.id, { invoicePrefix: 'TAKEN' });
    const actor = await actingFreelancerForTest(a.id);

    const bad = await svc.createSenderProfile(actor, formValues({ logo: 'http://example.com/l.png' }));
    expect(bad).toMatchObject({ success: false, code: 'VALIDATION' });

    const dup = await svc.createSenderProfile(actor, formValues({ invoicePrefix: taken.invoicePrefix }));
    expect(dup).toMatchObject({ success: false, code: 'CONFLICT' });
  });

  it('update: changes the owned profile; VALIDATION precedes NOT_FOUND', async () => {
    const a = await createFreelancer(prisma);
    const p = await createSenderProfile(prisma, a.id, { invoicePrefix: 'UPD' });
    const actor = await actingFreelancerForTest(a.id);

    const result = await svc.updateSenderProfile(actor, p.id, formValues({ name: 'Renamed', invoicePrefix: 'UPD' }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe('Renamed');

    const invalid = await svc.updateSenderProfile(actor, 'unknown', formValues({ name: '' }));
    expect(invalid).toMatchObject({ success: false, code: 'VALIDATION' });
  });

  it('delete: removes a profile without invoices', async () => {
    const o = await ownerGraph();
    const actor = await actingFreelancerForTest(o.freelancer.id);
    const result = await svc.deleteSenderProfile(actor, o.senderProfile.id);
    expect(result.success).toBe(true);
    expect(await prisma.senderProfile.findUnique({ where: { id: o.senderProfile.id } })).toBeNull();
  });

  it('AC-17: delete is blocked with CONFLICT + HAS_INVOICES and the count; nothing is removed', async () => {
    const o = await ownerGraph();
    for (let i = 1; i <= 2; i++) {
      await createInvoice(prisma, {
        senderProfile: o.senderProfile,
        customer: o.customer,
        bankAccount: o.bankAccount,
        overrides: { invoiceNumber: `${o.senderProfile.invoicePrefix}-000${i}` },
      });
    }
    const actor = await actingFreelancerForTest(o.freelancer.id);

    const result = await svc.deleteSenderProfile(actor, o.senderProfile.id);

    expect(result).toMatchObject({
      success: false,
      code: 'CONFLICT',
      error: "2 invoices depend on this sender profile, so it can't be deleted.",
      details: { kind: 'HAS_INVOICES', invoiceCount: 2 },
    });
    expect(await prisma.senderProfile.findUnique({ where: { id: o.senderProfile.id } })).not.toBeNull();
  });

  it('AC-17: an invoice saved between the count and the delete → recount, the same CONFLICT, never FAILED', async () => {
    const o = await ownerGraph();
    const actor = await actingFreelancerForTest(o.freelancer.id);
    const { prisma: appPrisma } = (await import('@/prisma')) as unknown as { prisma: PrismaClient };
    const realCount = appPrisma.invoice.count.bind(appPrisma.invoice) as (...a: unknown[]) => Promise<number>;
    let raced = false;
    vi.spyOn(appPrisma.invoice, 'count').mockImplementation((async (...args: unknown[]) => {
      const counted = await realCount(...args);
      if (!raced) {
        raced = true;
        await createInvoice(prisma, {
          senderProfile: o.senderProfile,
          customer: o.customer,
          bankAccount: o.bankAccount,
          overrides: { invoiceNumber: 'T9-RACE-0001' },
        });
      }
      return counted;
    }) as never);

    const result = await svc.deleteSenderProfile(actor, o.senderProfile.id);

    expect(result).toMatchObject({
      success: false,
      code: 'CONFLICT',
      details: { kind: 'HAS_INVOICES', invoiceCount: 1 },
    });
    expect(await prisma.senderProfile.findUnique({ where: { id: o.senderProfile.id } })).not.toBeNull();
  });
});
