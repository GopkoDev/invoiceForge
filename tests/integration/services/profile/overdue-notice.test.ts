// T22 (AC-24 notice): request-free business-layer test for getOverdueNoticeState and
// dismissOverdueNotice against a throwaway Postgres.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFreelancer } from '../../../support/factories/user';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Result<T> = { success: true; data: T } | { success: false; code: string; error: string };
type Service = {
  getOverdueNoticeState: (a: Actor) => Promise<Result<{ showOverdueRuleNotice: boolean }>>;
  dismissOverdueNotice: (a: Actor) => Promise<Result<void>>;
};

describe.runIf(containerRuntimeAvailable)('overdue notice business layer (T22)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/profile/overdue-notice')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('is true until dismissed; a repeat dismiss returns ok and keeps the first time', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    expect(await svc.getOverdueNoticeState(actor)).toEqual({
      success: true,
      data: { showOverdueRuleNotice: true },
    });
    expect((await svc.dismissOverdueNotice(actor)).success).toBe(true);
    const first = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect((await svc.dismissOverdueNotice(actor)).success).toBe(true);
    const second = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(second.overdueNoticeDismissedAt).toEqual(first.overdueNoticeDismissedAt);
    expect(await svc.getOverdueNoticeState(actor)).toEqual({
      success: true,
      data: { showOverdueRuleNotice: false },
    });
  });
});
