// T25 (ai-assistant; spec.md §5 AC-37): deleteConversation answers another Freelancer's Conversation exactly as an
// unknown id (NOT_FOUND); deleteAllConversations touches only the acting Freelancer's rows.
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

describe.runIf(containerRuntimeAvailable)('Conversation delete foreign-record (T25)', () => {
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

  it('deleteConversation: Freelancer B gets NOT_FOUND for the Conversation of Freelancer A and it stays', async () => {
    const a = await createFreelancer(prisma, { email: 't25-fa@example.com' });
    const b = await createFreelancer(prisma, { email: 't25-fb@example.com' });
    const conv = await createConversation(prisma, { userId: a.id, messages: [{ role: 'USER' }] });
    const actorB = await actingFreelancerForTest(b.id);

    expect(await svc.deleteConversation(actorB, conv.id)).toMatchObject(NOT_FOUND);
    expect(await prisma.conversation.count()).toBe(1);
  });

  it('deleteAllConversations: Freelancer B deleting all leaves the Conversations of Freelancer A', async () => {
    const a = await createFreelancer(prisma, { email: 't25-fa@example.com' });
    const b = await createFreelancer(prisma, { email: 't25-fb@example.com' });
    await createConversation(prisma, { userId: a.id, messages: [{ role: 'USER' }] });
    const actorB = await actingFreelancerForTest(b.id);

    expect(await svc.deleteAllConversations(actorB)).toEqual({ success: true, data: { deleted: 0 } });
    expect(await prisma.conversation.count()).toBe(1);
  });
});
