// T17 - liftKeyDraftLimit never reveals or changes another Freelancer's key (foreign-record suite).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createPersonalKey } from '../../../support/factories/personal-key';
import { createPersonalKeyDraftDay } from '../../../support/factories/personal-key-draft-day';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const NOW = new Date('2026-06-15T10:00:00Z');

describe.runIf(containerRuntimeAvailable)('liftKeyDraftLimit foreign record (Freelancer B key)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('liftKeyDraftLimit answers NOT_FOUND for a key of Freelancer B and leaves its row alone', async () => {
    const a = await createFreelancer(prisma, { email: 'a17@example.com', timeZone: 'Europe/Kyiv' });
    const b = await createFreelancer(prisma, { email: 'b17@example.com', timeZone: 'Europe/Kyiv' });
    const actor = await actingFreelancerForTest(a.id, 'Europe/Kyiv');
    const { row: foreign } = await createPersonalKey(prisma, b.id, { canCreateDrafts: true });
    const day = new Date('2026-06-15T00:00:00.000Z');
    await createPersonalKeyDraftDay(prisma, { personalKeyId: foreign.id, day, created: 50 });
    const { liftKeyDraftLimit } = await import('@/lib/services/assistant-usage/key-drafts');
    const res = await liftKeyDraftLimit(actor, foreign.id, NOW);
    expect(res).toMatchObject({ success: false, code: 'NOT_FOUND' });
    const row = await prisma.personalKeyDraftDay.findUniqueOrThrow({
      where: { personalKeyId_day: { personalKeyId: foreign.id, day } },
    });
    expect(row.allowance).toBe(50);
  });
});
