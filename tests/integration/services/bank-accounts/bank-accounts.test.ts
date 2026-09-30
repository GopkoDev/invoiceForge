// T10 (spec.md §5 AC-03, AC-08; public-api.md §2.5 Bank accounts) — request-free business
// functions in lib/services/bank-accounts/bank-accounts.ts against a throwaway Postgres.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount as seedBank } from '../../../support/factories/bank-account';
import { createCustomer } from '../../../support/factories/customer';
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]>; details?: unknown };
type Page<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean };
type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Account = { id: string; bankName: string; accountName: string; senderProfileId: string; isDefault: boolean };
type Service = {
  listBankAccounts: (a: Actor, spId: string, q?: Record<string, unknown>) => Promise<Result<Page<Account>>>;
  createBankAccount: (a: Actor, spId: string, input: unknown) => Promise<Result<Account>>;
  updateBankAccount: (a: Actor, id: string, input: unknown) => Promise<Result<Account>>;
  deleteBankAccount: (a: Actor, id: string) => Promise<Result<{ senderProfileId: string }>>;
};

const form = (over: Record<string, unknown> = {}) => ({
  bankName: 'Acme Bank',
  accountName: 'Jane Doe',
  accountNumber: '123456',
  iban: '',
  swift: '',
  currency: 'USD',
  isDefault: false,
  ...over,
});

describe.runIf(containerRuntimeAvailable)('bank accounts service (T10)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/bank-accounts/bank-accounts')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup() {
    const user = await createFreelancer(prisma);
    const sp = await createSenderProfile(prisma, user.id);
    return { user, sp, actor: await actingFreelancerForTest(user.id) };
  }

  it('listBankAccounts returns the full list as page 1 in today order (default first, newest first, id)', async () => {
    const { sp, actor } = await setup();
    const old = await seedBank(prisma, sp.id, { bankName: 'Old', isDefault: false });
    const def = await seedBank(prisma, sp.id, { bankName: 'Def', isDefault: true });
    const fresh = await seedBank(prisma, sp.id, { bankName: 'Fresh', isDefault: false });
    const r = await svc.listBankAccounts(actor, sp.id);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.items.map((a) => a.id)).toEqual([def.id, fresh.id, old.id]);
    expect(r.data).toMatchObject({ total: 3, page: 1, hasMore: false });
    expect(r.data.items[0]).toHaveProperty('_count.invoices', 0);
  });

  it('listBankAccounts searches bankName and accountName in any case', async () => {
    const { sp, actor } = await setup();
    await seedBank(prisma, sp.id, { bankName: 'Monobank', accountName: 'X', isDefault: false });
    await seedBank(prisma, sp.id, { bankName: 'Other', accountName: 'Holder MONO', isDefault: false });
    await seedBank(prisma, sp.id, { bankName: 'Nope', accountName: 'Nope', isDefault: false });
    const r = await svc.listBankAccounts(actor, sp.id, { search: 'mono' });
    expect(r.success && r.data.items.map((a) => a.bankName).sort()).toEqual(['Monobank', 'Other']);
  });

  it('listBankAccounts never searches accountNumber or iban', async () => {
    const { sp, actor } = await setup();
    await seedBank(prisma, sp.id, { accountNumber: '9988776655', iban: 'UA213223130000026007233566001' });
    for (const search of ['9988776655', 'UA213223130000026007233566001']) {
      const r = await svc.listBankAccounts(actor, sp.id, { search });
      expect(r.success && r.data.items).toEqual([]);
    }
  });

  it('listBankAccounts with { page: 1, pageSize: limit } returns the preview', async () => {
    const { sp, actor } = await setup();
    for (let i = 0; i < 4; i++) await seedBank(prisma, sp.id, { bankName: `B${i}`, isDefault: false });
    const r = await svc.listBankAccounts(actor, sp.id, { page: 1, pageSize: 2 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.items).toHaveLength(2);
    expect(r.data).toMatchObject({ total: 4, page: 1, pageSize: 2, hasMore: true });
  });

  it('listBankAccounts with an invalid query is VALIDATION', async () => {
    const { sp, actor } = await setup();
    const r = await svc.listBankAccounts(actor, sp.id, { page: 0 });
    expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
  });

  it('createBankAccount stores the row; a new default resets the others', async () => {
    const { sp, actor } = await setup();
    const first = await seedBank(prisma, sp.id, { isDefault: true });
    const r = await svc.createBankAccount(actor, sp.id, form({ isDefault: true }));
    expect(r.success).toBe(true);
    expect(await prisma.bankAccount.count({ where: { senderProfileId: sp.id } })).toBe(2);
    expect((await prisma.bankAccount.findUnique({ where: { id: first.id } }))?.isDefault).toBe(false);
  });

  it('createBankAccount with invalid input is VALIDATION with fieldErrors', async () => {
    const { sp, actor } = await setup();
    const r = await svc.createBankAccount(actor, sp.id, form({ bankName: '' }));
    expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
    if (!r.success) expect(r.fieldErrors?.bankName).toBeDefined();
  });

  it('updateBankAccount changes the row and returns it with its senderProfileId', async () => {
    const { sp, actor } = await setup();
    const acc = await seedBank(prisma, sp.id, { isDefault: false });
    const other = await seedBank(prisma, sp.id, { isDefault: true });
    const r = await svc.updateBankAccount(actor, acc.id, form({ bankName: 'Renamed', isDefault: true }));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ id: acc.id, bankName: 'Renamed', senderProfileId: sp.id });
    expect((await prisma.bankAccount.findUnique({ where: { id: other.id } }))?.isDefault).toBe(false);
  });

  it('deleteBankAccount removes an unused account and returns its senderProfileId', async () => {
    const { sp, actor } = await setup();
    const acc = await seedBank(prisma, sp.id);
    const r = await svc.deleteBankAccount(actor, acc.id);
    expect(r).toEqual({ success: true, data: { senderProfileId: sp.id } });
    expect(await prisma.bankAccount.findUnique({ where: { id: acc.id } })).toBeNull();
  });

  it('deleteBankAccount used by invoices is CONFLICT with today message and no details', async () => {
    const { user, sp, actor } = await setup();
    const acc = await seedBank(prisma, sp.id);
    const cu = await createCustomer(prisma, user.id);
    await seedInvoice(prisma, { senderProfile: sp, customer: cu, bankAccount: acc });
    const r = await svc.deleteBankAccount(actor, acc.id);
    expect(r).toMatchObject({
      success: false,
      code: 'CONFLICT',
      error: 'Cannot delete bank account with existing invoices. Please delete or reassign invoices first.',
    });
    if (!r.success) expect(r.details).toBeUndefined();
    expect(await prisma.bankAccount.findUnique({ where: { id: acc.id } })).not.toBeNull();
  });
});
