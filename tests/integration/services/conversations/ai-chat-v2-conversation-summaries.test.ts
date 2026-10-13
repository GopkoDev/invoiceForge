// ai-chat-v2 T18 (spec.md §5 AC-17, AC-18, AC-30; contracts/server-actions.md §listConversationSummaries,
// §listLatestConversations): every Conversation summary newest first with the Freelancer time zone, and the latest
// three for the dashboard. Owner-scoped; request-free against a throwaway Postgres.
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

type Summary = { id: string; title: string; lastMessageAt: string };
type Svc = {
  listConversationSummaries: (a: unknown) => Promise<{ success: boolean; data?: { items: Summary[]; timeZone: string } }>;
  listLatestConversations: (a: unknown, limit?: number) => Promise<{ success: boolean; data?: Summary[] }>;
};

describe.runIf(containerRuntimeAvailable)('listConversationSummaries and listLatestConversations (ai-chat-v2 T18)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/conversations/conversations')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  async function fiveConversations(userId: string) {
    const made = [];
    for (const [i, n] of [8, 0, 3, 1, 30].entries()) {
      made.push(await createConversation(prisma, { userId, title: `Chat ${i}`, lastMessageAt: daysAgo(n) }));
    }
    return made;
  }

  it('AC-17: every owned Conversation, newest last message first, with the Freelancer time zone; no paging', async () => {
    const user = await createFreelancer(prisma, { email: 't18-a@example.com' });
    const other = await createFreelancer(prisma, { email: 't18-b@example.com' });
    await fiveConversations(user.id);
    for (let i = 0; i < 22; i += 1) {
      await createConversation(prisma, { userId: user.id, title: `Old ${i}`, lastMessageAt: daysAgo(40 + i) });
    }
    await createConversation(prisma, { userId: other.id, title: "B's chat", lastMessageAt: new Date() });

    const actor = await actingFreelancerForTest(user.id, 'Europe/Kyiv');
    const res = await svc.listConversationSummaries(actor);
    expect(res.success).toBe(true);
    const { items, timeZone } = res.data!;
    expect(timeZone).toBe('Europe/Kyiv');
    expect(items).toHaveLength(27);
    expect(items.slice(0, 5).map((i) => i.title)).toEqual(['Chat 1', 'Chat 3', 'Chat 2', 'Chat 0', 'Chat 4']);
    expect(items.some((i) => i.title === "B's chat")).toBe(false);
    const times = items.map((i) => Date.parse(i.lastMessageAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(Object.keys(items[0]).sort()).toEqual(['id', 'lastMessageAt', 'title']);
  });

  it('AC-18: with no Conversations the list is empty', async () => {
    const user = await createFreelancer(prisma, { email: 't18-a@example.com' });
    const res = await svc.listConversationSummaries(await actingFreelancerForTest(user.id));
    expect(res.data!.items).toEqual([]);
  });

  it('AC-30: listLatestConversations gives the latest three of five, newest first, owner-scoped', async () => {
    const user = await createFreelancer(prisma, { email: 't18-a@example.com' });
    const other = await createFreelancer(prisma, { email: 't18-b@example.com' });
    await fiveConversations(user.id);
    await createConversation(prisma, { userId: other.id, title: "B's chat", lastMessageAt: new Date() });
    const res = await svc.listLatestConversations(await actingFreelancerForTest(user.id));
    expect(res.success).toBe(true);
    expect(res.data!.map((i) => i.title)).toEqual(['Chat 1', 'Chat 3', 'Chat 2']);
  });

  it('AC-30: listLatestConversations is [] for a Freelancer with none', async () => {
    const user = await createFreelancer(prisma, { email: 't18-a@example.com' });
    expect(await svc.listLatestConversations(await actingFreelancerForTest(user.id))).toEqual({ success: true, data: [] });
  });
});

describe.runIf(!containerRuntimeAvailable)('listConversationSummaries (ai-chat-v2 T18)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
