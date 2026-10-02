// T10 (spec.md §5 AC-08) — B's profile or account answers exactly like an id that never existed;
// nothing is stored and B's row stays unchanged.
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

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Result = { success: boolean; code?: string; error?: string };
type Service = {
  listBankAccounts: (a: Actor, spId: string, q?: unknown) => Promise<Result>;
  createBankAccount: (a: Actor, spId: string, input: unknown) => Promise<Result>;
  updateBankAccount: (a: Actor, id: string, input: unknown) => Promise<Result>;
  deleteBankAccount: (a: Actor, id: string) => Promise<Result>;
};

const input = {
  bankName: 'Hijacked',
  accountName: 'Hijacked',
  accountNumber: '1',
  iban: '',
  swift: '',
  currency: 'USD',
  isDefault: true,
};

describe.runIf(containerRuntimeAvailable)('bank accounts foreign-record (T10, AC-08)', () => {
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
    const a = await createFreelancer(prisma);
    const b = await createFreelancer(prisma);
    const bProfile = await createSenderProfile(prisma, b.id);
    const bAccount = await seedBank(prisma, bProfile.id, { bankName: 'B bank' });
    return { actor: await actingFreelancerForTest(a.id), bProfile, bAccount };
  }

  const profileNotFound = { success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' };
  const accountNotFound = { success: false, code: 'NOT_FOUND', error: 'Bank account not found.' };

  it('listBankAccounts with B profile is NOT_FOUND, same as a never-existing id', async () => {
    const { actor, bProfile } = await setup();
    expect(await svc.listBankAccounts(actor, bProfile.id)).toMatchObject(profileNotFound);
    expect(await svc.listBankAccounts(actor, 'never-existed')).toMatchObject(profileNotFound);
  });

  it('createBankAccount with B profile is NOT_FOUND and nothing is stored', async () => {
    const { actor, bProfile } = await setup();
    expect(await svc.createBankAccount(actor, bProfile.id, input)).toMatchObject(profileNotFound);
    expect(await prisma.bankAccount.count({ where: { senderProfileId: bProfile.id } })).toBe(1);
  });

  it('updateBankAccount with B account is NOT_FOUND and B row is unchanged', async () => {
    const { actor, bAccount } = await setup();
    expect(await svc.updateBankAccount(actor, bAccount.id, input)).toMatchObject(accountNotFound);
    expect(await prisma.bankAccount.findUnique({ where: { id: bAccount.id } })).toEqual(bAccount);
  });

  it('deleteBankAccount with B account is NOT_FOUND and B row is unchanged', async () => {
    const { actor, bAccount } = await setup();
    expect(await svc.deleteBankAccount(actor, bAccount.id)).toMatchObject(accountNotFound);
    expect(await prisma.bankAccount.findUnique({ where: { id: bAccount.id } })).toEqual(bAccount);
  });
});
