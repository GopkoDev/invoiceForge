// T10 (ai-assistant; spec.md §5 AC-41): getConversation and loadHistory answer another Freelancer's
// Conversation exactly as an unknown id (NOT_FOUND).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createConversation } from '../../../support/factories/conversation';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const NOT_FOUND = { success: false, code: 'NOT_FOUND', error: "This conversation can't be found." };

describe.runIf(containerRuntimeAvailable)('Conversation foreign-record (T10)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: typeof import('@/lib/services/conversations');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/conversations');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('getConversation and loadHistory: Freelancer B gets NOT_FOUND for the Conversation of Freelancer A', async () => {
    const a = await createFreelancer(prisma, { email: 't10-fa@example.com' });
    const b = await createFreelancer(prisma, { email: 't10-fb@example.com' });
    const conv = await createConversation(prisma, { userId: a.id, messages: [{ role: 'USER' }] });
    const actorB = await actingFreelancerForTest(b.id);

    expect(await svc.getConversation(actorB, conv.id)).toMatchObject(NOT_FOUND);
    expect(await svc.loadHistory(actorB, conv.id)).toMatchObject(NOT_FOUND);
  });
});
