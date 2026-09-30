// T10 (spec.md §5 AC-03) — the thin web wrappers keep today's three revalidatePath calls per
// mutation (list, edit, edit bank accounts), and getBankAccounts(id, limit) keeps returning an array.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createBankAccount as seedBank } from '../../support/factories/bank-account';
import { protectedRoutes } from '@/config/routes.config';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const revalidatePathMock = vi.fn();
let currentUserId = '';
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/helpers/auth-helpers', () => ({
  getAuthenticatedUser: async () => ({ success: true, data: { userId: currentUserId } }),
}));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: currentUserId } }) }));

const form = {
  bankName: 'Acme Bank',
  accountName: 'Jane Doe',
  accountNumber: '123456',
  iban: '',
  swift: '',
  currency: 'USD',
  isDefault: false,
} as never;

describe.runIf(containerRuntimeAvailable)('bank-account wrappers revalidation (T10, AC-03)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let actions: typeof import('@/lib/actions/bank-account-actions');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    actions = await import('@/lib/actions/bank-account-actions');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => revalidatePathMock.mockClear());
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup() {
    const user = await createFreelancer(prisma);
    currentUserId = user.id;
    const sp = await createSenderProfile(prisma, user.id);
    const expected = [
      protectedRoutes.senderProfiles,
      protectedRoutes.senderProfileEdit(sp.id),
      protectedRoutes.senderProfileEditBankAccounts(sp.id),
    ];
    return { sp, expected };
  }
  const paths = () => revalidatePathMock.mock.calls.map((c) => c[0]);

  it('create revalidates the three paths', async () => {
    const { sp, expected } = await setup();
    expect((await actions.createBankAccount(sp.id, form)).success).toBe(true);
    expect(paths()).toEqual(expected);
  });

  it('update revalidates the three paths by the existing account senderProfileId', async () => {
    const { sp, expected } = await setup();
    const acc = await seedBank(prisma, sp.id, { isDefault: false });
    expect((await actions.updateBankAccount(acc.id, form)).success).toBe(true);
    expect(paths()).toEqual(expected);
  });

  it('delete revalidates the three paths by the deleted account senderProfileId', async () => {
    const { sp, expected } = await setup();
    const acc = await seedBank(prisma, sp.id);
    expect((await actions.deleteBankAccount(acc.id)).success).toBe(true);
    expect(paths()).toEqual(expected);
  });

  it('a failed mutation revalidates nothing', async () => {
    await setup();
    expect((await actions.deleteBankAccount('never-existed')).success).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('getBankAccounts(id, limit) returns an array of at most limit; without limit the full list', async () => {
    const { sp } = await setup();
    for (let i = 0; i < 3; i++) await seedBank(prisma, sp.id, { isDefault: false });
    const limited = await actions.getBankAccounts(sp.id, 2);
    expect(limited.success && limited.data).toHaveLength(2);
    const full = await actions.getBankAccounts(sp.id);
    expect(full.success && full.data).toHaveLength(3);
  });
});
