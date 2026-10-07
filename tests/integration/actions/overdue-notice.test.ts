// T22 (AC-24 notice, AC-01 entry point) — getDashboardNoticeState is true until
// dismissOverdueRuleNotice runs; repeat dismiss returns ok; the Connect your AI entry point read
// is true until any key (active or revoked) has a last use. Guard-first on every action.
// Seam: same-process app code, mocked '@/auth', real throwaway Postgres (see
// profile-actions-guard-first.test.ts).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createPersonalKey } from '../../support/factories/personal-key';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock = vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

type Result<T> = { success: true; data: T } | { success: false; code: string; error: string };
type Actions = {
  getDashboardNoticeState: () => Promise<Result<{ showOverdueRuleNotice: boolean }>>;
  dismissOverdueRuleNotice: () => Promise<Result<void>>;
  getConnectAiEntryState: () => Promise<Result<{ showConnectAiEntry: boolean }>>;
};

describe.runIf(containerRuntimeAvailable)('overdue-rule notice + Connect your AI entry (T22)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let actions: Actions;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    actions = (await import('@/lib/actions/dashboard-actions')) as unknown as Actions;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => authMock.mockReset());
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function signIn() {
    const user = await createFreelancer(prisma);
    authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
    return user;
  }

  it('AC-24: notice is shown until dismissed, dismissal is idempotent and keeps the first timestamp', async () => {
    const user = await signIn();
    const before = await actions.getDashboardNoticeState();
    expect(before).toEqual({ success: true, data: { showOverdueRuleNotice: true } });

    expect((await actions.dismissOverdueRuleNotice()).success).toBe(true);
    const first = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(first.overdueNoticeDismissedAt).not.toBeNull();

    const again = await actions.dismissOverdueRuleNotice();
    expect(again.success).toBe(true);
    const second = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(second.overdueNoticeDismissedAt).toEqual(first.overdueNoticeDismissedAt);

    expect(await actions.getDashboardNoticeState()).toEqual({
      success: true,
      data: { showOverdueRuleNotice: false },
    });
  });

  it('AC-24: dismissal is per account, another Freelancer still sees the notice', async () => {
    await signIn();
    await actions.dismissOverdueRuleNotice();
    await signIn();
    expect(await actions.getDashboardNoticeState()).toEqual({
      success: true,
      data: { showOverdueRuleNotice: true },
    });
  });

  it('with no session every action returns UNAUTHORIZED', async () => {
    authMock.mockResolvedValue(null);
    const state = await actions.getDashboardNoticeState();
    const dismiss = await actions.dismissOverdueRuleNotice();
    const entry = await actions.getConnectAiEntryState();
    for (const r of [state, dismiss, entry]) {
      expect(r.success).toBe(false);
      if (!r.success) expect(r.code).toBe('UNAUTHORIZED');
    }
  });

  it('AC-01: entry point shows with no keys and with keys that were never used', async () => {
    const user = await signIn();
    expect(await actions.getConnectAiEntryState()).toEqual({
      success: true,
      data: { showConnectAiEntry: true },
    });
    await createPersonalKey(prisma, user.id);
    expect(await actions.getConnectAiEntryState()).toEqual({
      success: true,
      data: { showConnectAiEntry: true },
    });
  });

  it('AC-01: entry point is gone once a key was used, even if every key is revoked', async () => {
    const user = await signIn();
    await createPersonalKey(prisma, user.id, { lastUsedAt: new Date(), revoked: true });
    expect(await actions.getConnectAiEntryState()).toEqual({
      success: true,
      data: { showConnectAiEntry: false },
    });
  });
});
