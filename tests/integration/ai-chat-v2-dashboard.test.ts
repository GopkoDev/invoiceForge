// ai-chat-v2 T26 (spec.md §5 AC-30, AC-32, AC-36; screens.md §SCR-09): getDashboardAiBlock, the dashboard AI block's
// read - the allowance and the latest three Conversations, owner-scoped. Reading it never writes: a used-up
// Freelancer's dashboard creates no Conversation and counts nothing; a signed-out request reads nothing.
// Seam: same-process app code, mocked '@/auth', real throwaway Postgres (see overdue-notice.test.ts).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createConversation } from '../support/factories/conversation';
import { createMessageAllowanceDay } from '../support/factories/message-allowance-day';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock = vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

type Summary = { id: string; title: string; lastMessageAt: string };
type Block = {
  allowance: { limit: number; used: number; left: number; renewsAt: string; timeZone: string };
  latest: Summary[];
  timeZone: string;
};
type Result<T> = { success: true; data: T } | { success: false; code: string; error: string };
type Actions = { getDashboardAiBlock: () => Promise<Result<Block>> };

describe.runIf(containerRuntimeAvailable)('getDashboardAiBlock (ai-chat-v2 T26)', () => {
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

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  async function signIn(email: string) {
    const user = await createFreelancer(prisma, { email });
    authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
    return user;
  }

  it('AC-30: the latest three of five by last message, newest first, never another Freelancer\'s', async () => {
    const other = await createFreelancer(prisma, { email: 't26-b@example.com' });
    await createConversation(prisma, { userId: other.id, title: "B's newest", lastMessageAt: new Date() });
    const user = await signIn('t26-a@example.com');
    for (const [i, n] of [8, 0, 3, 1, 30].entries()) {
      await createConversation(prisma, { userId: user.id, title: `Chat ${i}`, lastMessageAt: daysAgo(n) });
    }

    const res = await actions.getDashboardAiBlock();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.latest.map((c) => c.title)).toEqual(['Chat 1', 'Chat 3', 'Chat 2']);
    expect(res.data.allowance).toMatchObject({ limit: 30, left: 30 });
  });

  it('AC-30: none yet is an empty list', async () => {
    await signIn('t26-a@example.com');
    const res = await actions.getDashboardAiBlock();
    expect(res).toMatchObject({ success: true, data: { latest: [] } });
  });

  it('AC-32: with the allowance used up the block reads left = 0 and creates or counts nothing', async () => {
    const user = await signIn('t26-a@example.com');
    await createMessageAllowanceDay(prisma, { userId: user.id, used: 30 });

    const res = await actions.getDashboardAiBlock();
    expect(res).toMatchObject({ success: true, data: { allowance: { used: 30, left: 0 } } });
    expect(await prisma.conversation.count()).toBe(0);
    expect(await prisma.conversationMessage.count()).toBe(0);
    const day = await prisma.messageAllowanceDay.findFirstOrThrow({ where: { userId: user.id } });
    expect(day.used).toBe(30);
  });

  it('AC-36: signed out, the read is refused and nothing is read or written', async () => {
    authMock.mockResolvedValue(null);
    const res = await actions.getDashboardAiBlock();
    expect(res).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(await prisma.messageAllowanceDay.count()).toBe(0);
  });
});
