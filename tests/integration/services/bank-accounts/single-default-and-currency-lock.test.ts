// invoice-integrity T12 (spec.md §5 AC-13, AC-17, AC-17b; §6 NFR "Default uniqueness"; ADR-0005) —
// exactly one default bank account per sender profile, under the SenderProfile row lock, and the
// currency of an account used by invoices (any status) can't change.
// contracts/server-actions.md §Bank accounts.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BankAccount, PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createCustomer } from '../../../support/factories/customer';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const UNSET = "The default account can't be switched off. Make another account the default instead.";

describe.runIf(containerRuntimeAvailable)('bank accounts: single default and currency lock (T12)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: typeof import('@/lib/services/bank-accounts/bank-accounts');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/bank-accounts/bank-accounts');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed() {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const profile = await createSenderProfile(prisma, user.id);
    return { user, actor, profile };
  }

  type Form = Parameters<typeof svc.createBankAccount>[2];
  const form = (over: Record<string, unknown> = {}): Form =>
    ({
      bankName: 'Bank',
      accountName: 'Holder',
      accountNumber: '0000000000',
      currency: 'USD',
      isDefault: false,
      ...over,
    }) as Form;
  const formOf = (a: BankAccount, over: Record<string, unknown> = {}) =>
    form({
      bankName: a.bankName,
      accountName: a.accountName,
      accountNumber: a.accountNumber,
      iban: a.iban ?? undefined,
      swift: a.swift ?? undefined,
      currency: a.currency,
      isDefault: a.isDefault,
      ...over,
    });

  async function defaults(senderProfileId: string) {
    const rows = await prisma.bankAccount.findMany({ where: { senderProfileId, isDefault: true }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  it('AC-17b: the first account is the default whatever was sent; creating with isDefault switches', async () => {
    const s = await seed();
    const first = await svc.createBankAccount(s.actor, s.profile.id, form({ isDefault: false }));
    expect(first.success && first.data.isDefault).toBe(true);
    const second = await svc.createBankAccount(s.actor, s.profile.id, form());
    expect(second.success && second.data.isDefault).toBe(false);
    const third = await svc.createBankAccount(s.actor, s.profile.id, form({ isDefault: true }));
    expect(await defaults(s.profile.id)).toEqual([third.success && third.data.id]);
  });

  it('AC-17: making B the default clears A, a repeat succeeds; another profile keeps its own default', async () => {
    const s = await seed();
    const other = await createSenderProfile(prisma, s.user.id);
    const otherDefault = await createBankAccount(prisma, other.id);
    await createBankAccount(prisma, s.profile.id);
    const b = await createBankAccount(prisma, s.profile.id);
    expect(await svc.updateBankAccount(s.actor, b.id, formOf(b, { isDefault: true }))).toMatchObject({ success: true });
    expect(await svc.updateBankAccount(s.actor, b.id, formOf(b, { isDefault: true }))).toMatchObject({ success: true });
    expect(await defaults(s.profile.id)).toEqual([b.id]);
    expect(await defaults(other.id)).toEqual([otherDefault.id]);
  });

  it('AC-17b: the default account cannot be switched off without choosing another', async () => {
    const s = await seed();
    const a = await createBankAccount(prisma, s.profile.id);
    const res = await svc.updateBankAccount(s.actor, a.id, formOf(a, { isDefault: false, bankName: 'Renamed' }));
    expect(res).toEqual({ success: false, code: 'VALIDATION', error: UNSET, fieldErrors: { isDefault: [UNSET] } });
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: a.id } })).bankName).toBe(a.bankName);
  });

  it('AC-17b: deleting the default promotes the earliest-created remaining account', async () => {
    const s = await seed();
    const a = await createBankAccount(prisma, s.profile.id);
    await createBankAccount(prisma, s.profile.id);
    const c = await createBankAccount(prisma, s.profile.id);
    await prisma.bankAccount.update({ where: { id: c.id }, data: { createdAt: new Date('2020-01-01T00:00:00Z') } });
    expect((await svc.deleteBankAccount(s.actor, a.id)).success).toBe(true);
    expect(await defaults(s.profile.id)).toEqual([c.id]);
  });

  it('NFR: 10 parallel set-default requests leave exactly one default', async () => {
    const s = await seed();
    const accounts: BankAccount[] = [];
    for (let i = 0; i < 5; i++) accounts.push(await createBankAccount(prisma, s.profile.id));
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const a = accounts[i % accounts.length];
        return svc.updateBankAccount(s.actor, a.id, formOf(a, { isDefault: true }));
      })
    );
    for (const r of results) expect(r.success || r.code === 'CONFLICT').toBe(true);
    expect(await defaults(s.profile.id)).toHaveLength(1);
  });

  it('AC-13: an account used by a draft, a pending and a cancelled invoice refuses a currency change with N = 3', async () => {
    const s = await seed();
    const account = await createBankAccount(prisma, s.profile.id, { iban: 'UA00 OLD' });
    const customer = await createCustomer(prisma, s.user.id);
    for (const [i, status] of (['DRAFT', 'PENDING', 'CANCELLED'] as const).entries()) {
      await createInvoice(prisma, {
        senderProfile: s.profile,
        customer,
        bankAccount: account,
        overrides: { status, invoiceNumber: `CL-${i}` },
      });
    }
    const message = "The currency of an account used by 3 invoice(s) can't change.";
    const res = await svc.updateBankAccount(s.actor, account.id, formOf(account, { currency: 'EUR', iban: 'UA99 NEW' }));
    expect(res).toEqual({
      success: false,
      code: 'CONFLICT',
      error: message,
      fieldErrors: { currency: [message] },
      details: { kind: 'HAS_INVOICES', invoiceCount: 3 },
    });
    expect(await prisma.bankAccount.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({
      currency: 'USD',
      iban: 'UA00 OLD',
    });

    // The same request without the currency change saves the IBAN.
    const saved = await svc.updateBankAccount(s.actor, account.id, formOf(account, { iban: 'UA99 NEW' }));
    expect(saved.success).toBe(true);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: account.id } })).iban).toBe('UA99 NEW');
  });

  it('currency CONFLICT wins over the unset refusal (step order)', async () => {
    const s = await seed();
    const account = await createBankAccount(prisma, s.profile.id);
    await createInvoice(prisma, { senderProfile: s.profile, customer: await createCustomer(prisma, s.user.id), bankAccount: account });
    const res = await svc.updateBankAccount(s.actor, account.id, formOf(account, { currency: 'EUR', isDefault: false }));
    expect(res).toMatchObject({ code: 'CONFLICT', details: { kind: 'HAS_INVOICES', invoiceCount: 1 } });
  });

  it("a foreign account or profile is NOT_FOUND", async () => {
    const s = await seed();
    const other = await seed();
    const foreign = await createBankAccount(prisma, other.profile.id);
    expect(await svc.updateBankAccount(s.actor, foreign.id, formOf(foreign))).toMatchObject({ code: 'NOT_FOUND' });
    expect(await svc.createBankAccount(s.actor, other.profile.id, form())).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('the retryable CONFLICT for a unique hit on the default index', async () => {
    expect(svc.defaultAccountConflict()).toEqual({
      success: false,
      code: 'CONFLICT',
      error: "Couldn't change the default account. Please try again.",
    });
  });
});

describe.runIf(!containerRuntimeAvailable)('bank accounts: single default and currency lock (T12)', () => {
  it.skip('skipped: no container runtime', () => {});
});
