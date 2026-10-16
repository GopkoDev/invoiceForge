// T25 (ai-assistant; spec.md §5 AC-35; sad.md §6 chat message sequence) - saveTurn writes one exchange under the
// Conversation row lock: creates the Conversation on the first message (pre-generated id, title = first 80
// characters trimmed), appends the user and assistant messages at the next positions, stores the proposed card as the
// only LIVE card, writes one AssistantTurn (metadata only) and moves lastMessageAt. recordTurnMetadata saves a turn
// that has no messages. Another Freelancer's id answers exactly as an unknown id.
// Expected production modules:
//   lib/services/conversations/save-turn.ts (also re-exported from '@/lib/services/conversations') exporting
//     saveTurn(actor, input: { conversation: { id: string; isNew: boolean }; userText: string;
//       assistantParts: ConversationMessageView['parts']; turn: AssistantTurnMetadata;
//       proposedCard?: { id: string; request: unknown; proposal: unknown } })
//       -> Promise<ActionResult<{ conversationId: string; title: string }>>
//   lib/services/assistant-usage/turns.ts exporting recordTurnMetadata(actor, turn: AssistantTurnMetadata) -> Promise<ActionResult<void>>
//   AssistantTurnMetadata = { topic: 'IN_SCOPE'|'MIXED'|'OFF_TOPIC'|null; outcome: 'ANSWERED'|'CAPPED'|'FAILED'|'ALLOWANCE_USED_UP';
//     counted: boolean; steps: number; toolNames: string[]; durationMs: number; inputTokens: number|null;
//     outputTokens: number|null; costUsd: number|null }
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createConversation } from '../../../support/factories/conversation';
import { createDraftCard } from '../../../support/factories/draft-card';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const NOT_FOUND = {
  success: false,
  code: 'NOT_FOUND',
  error: "This conversation can't be found.",
};

type Turn = {
  topic: 'IN_SCOPE' | 'MIXED' | 'OFF_TOPIC' | null;
  outcome: 'ANSWERED' | 'CAPPED' | 'FAILED' | 'ALLOWANCE_USED_UP';
  counted: boolean;
  steps: number;
  toolNames: string[];
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};
type Parts = Array<{ type: 'text'; text: string }>;
type SaveInput = {
  conversation: { id: string; isNew: boolean };
  userText: string;
  assistantParts: Parts;
  turn: Turn;
  proposedCard?: { id: string; request: unknown; proposal: unknown };
};
type Saved =
  | { success: true; data: { conversationId: string; title: string } }
  | { success: false; code: string; error?: string };
type Svc = {
  saveTurn: (actor: unknown, input: SaveInput) => Promise<Saved>;
};
type Turns = {
  recordTurnMetadata: (
    actor: unknown,
    turn: Turn
  ) => Promise<{ success: boolean }>;
};

const TURN: Turn = {
  topic: 'IN_SCOPE',
  outcome: 'ANSWERED',
  counted: true,
  steps: 2,
  toolNames: ['find_customer', 'propose_draft'],
  durationMs: 1800,
  inputTokens: 900,
  outputTokens: 120,
  costUsd: 0.001234,
};
const reply = (text: string): Parts => [{ type: 'text', text }];

describe.runIf(containerRuntimeAvailable)('Saving a chat turn (T25)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let turns: Turns;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/conversations')) as unknown as Svc;
    turns =
      (await import('@/lib/services/assistant-usage')) as unknown as Turns;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function freelancer(email = 't25-a@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    return { user, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  const messagesOf = (conversationId: string) =>
    prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { position: 'asc' },
    });

  it('AC-35: the first message creates the Conversation with the given id, a title from the text and two messages', async () => {
    const { user, actor } = await freelancer();

    const result = await svc.saveTurn(actor, {
      conversation: { id: 'cnv_pregenerated_01', isNew: true },
      userText: '  Invoice Acme Corp for 20 hours  ',
      assistantParts: reply('Here is the draft.'),
      turn: TURN,
    });

    expect(result).toEqual({
      success: true,
      data: {
        conversationId: 'cnv_pregenerated_01',
        title: 'Invoice Acme Corp for 20 hours',
      },
    });
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: 'cnv_pregenerated_01' },
    });
    expect(conversation.userId).toBe(user.id);
    expect(conversation.title).toBe('Invoice Acme Corp for 20 hours');
    expect(
      Math.abs(Date.now() - conversation.lastMessageAt.getTime())
    ).toBeLessThan(60_000);
    const messages = await messagesOf('cnv_pregenerated_01');
    expect(messages.map((m) => [m.position, m.role])).toEqual([
      [0, 'USER'],
      [1, 'ASSISTANT'],
    ]);
    expect(messages[0].parts).toEqual([
      { type: 'text', text: '  Invoice Acme Corp for 20 hours  ' },
    ]);
    expect(messages[1].parts).toEqual(reply('Here is the draft.'));
  });

  it('AC-35: a 300-character first message gives a title of its first 80 characters, trimmed', async () => {
    const { actor } = await freelancer();
    const text = `${'a'.repeat(79)} ${'b'.repeat(220)}`;

    const result = await svc.saveTurn(actor, {
      conversation: { id: 'cnv_long_title', isNew: true },
      userText: text,
      assistantParts: reply('ok'),
      turn: TURN,
    });

    expect(result.success).toBe(true);
    const stored = await prisma.conversation.findUniqueOrThrow({
      where: { id: 'cnv_long_title' },
    });
    expect(stored.title).toBe(text.slice(0, 80).trim());
    expect(stored.title.length).toBeLessThanOrEqual(80);
    expect(stored.title.length).toBeGreaterThan(70);
    if (result.success) expect(result.data.title).toBe(stored.title);
  });

  it('AC-35: a later message appends at the next positions, keeps the title and moves lastMessageAt', async () => {
    const { user, actor } = await freelancer();
    const old = new Date('2026-01-01T00:00:00Z');
    const conversation = await createConversation(prisma, {
      userId: user.id,
      title: 'Original title',
      lastMessageAt: old,
      messages: [{ role: 'USER' }, { role: 'ASSISTANT' }],
    });

    const result = await svc.saveTurn(actor, {
      conversation: { id: conversation.id, isNew: false },
      userText: 'And add 10 more hours',
      assistantParts: reply('Done.'),
      turn: TURN,
    });

    expect(result).toEqual({
      success: true,
      data: { conversationId: conversation.id, title: 'Original title' },
    });
    const messages = await messagesOf(conversation.id);
    expect(messages.map((m) => [m.position, m.role])).toEqual([
      [0, 'USER'],
      [1, 'ASSISTANT'],
      [2, 'USER'],
      [3, 'ASSISTANT'],
    ]);
    const stored = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(stored.title).toBe('Original title');
    expect(stored.lastMessageAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it('AC-35: two parallel saves to one Conversation get positions 0-3 without gaps, collisions or interleaving', async () => {
    const { actor } = await freelancer();
    await svc.saveTurn(actor, {
      conversation: { id: 'cnv_parallel', isNew: true },
      userText: 'first',
      assistantParts: reply('first reply'),
      turn: TURN,
    });
    // positions 0-1 exist; two racers add 2-3 and 4-5 -> the pairs must stay adjacent
    const [a, b] = await Promise.all([
      svc.saveTurn(actor, {
        conversation: { id: 'cnv_parallel', isNew: false },
        userText: 'racer A',
        assistantParts: reply('reply A'),
        turn: TURN,
      }),
      svc.saveTurn(actor, {
        conversation: { id: 'cnv_parallel', isNew: false },
        userText: 'racer B',
        assistantParts: reply('reply B'),
        turn: TURN,
      }),
    ]);

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    const messages = await messagesOf('cnv_parallel');
    expect(messages.map((m) => m.position)).toEqual([0, 1, 2, 3, 4, 5]);
    const texts = messages.map((m) => (m.parts as Parts)[0].text);
    const pairs = [texts.slice(2, 4), texts.slice(4, 6)];
    expect(pairs).toContainEqual(['racer A', 'reply A']);
    expect(pairs).toContainEqual(['racer B', 'reply B']);
  });

  it('AC-35: a proposed card is stored as the only LIVE card and a second proposal replaces it', async () => {
    const { user, actor } = await freelancer();
    const request = { customer: 'Acme', lines: [] };
    const proposal = { total: '1000.00' };

    await svc.saveTurn(actor, {
      conversation: { id: 'cnv_cards', isNew: true },
      userText: 'Invoice Acme',
      assistantParts: [...reply('Draft ready.')],
      turn: TURN,
      proposedCard: { id: 'card_first', request, proposal },
    });
    const live1 = await prisma.draftCard.findMany({
      where: { conversationId: 'cnv_cards', state: 'LIVE' },
    });
    expect(live1.map((c) => c.id)).toEqual(['card_first']);
    expect(live1[0].userId).toBe(user.id);
    expect(live1[0].request).toEqual(request);
    expect(live1[0].proposal).toEqual(proposal);

    await svc.saveTurn(actor, {
      conversation: { id: 'cnv_cards', isNew: false },
      userText: 'Make it 30 hours',
      assistantParts: reply('Updated.'),
      turn: TURN,
      proposedCard: {
        id: 'card_second',
        request,
        proposal: { total: '1500.00' },
      },
    });

    const cards = await prisma.draftCard.findMany({
      where: { conversationId: 'cnv_cards' },
      orderBy: { createdAt: 'asc' },
    });
    expect(cards.map((c) => [c.id, c.state])).toEqual([
      ['card_first', 'REPLACED'],
      ['card_second', 'LIVE'],
    ]);
    expect(cards[0].replacedById).toBe('card_second');
  });

  it('AC-35: one AssistantTurn row is written for the exchange, linked to the Conversation, with metadata only', async () => {
    const { user, actor } = await freelancer();

    await svc.saveTurn(actor, {
      conversation: { id: 'cnv_meta', isNew: true },
      userText: 'secret customer name Zed Corp',
      assistantParts: reply('secret amount 999'),
      turn: TURN,
    });

    const rows = await prisma.assistantTurn.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      conversationId: 'cnv_meta',
      topic: 'IN_SCOPE',
      outcome: 'ANSWERED',
      counted: true,
      steps: 2,
      toolNames: ['find_customer', 'propose_draft'],
      durationMs: 1800,
      inputTokens: 900,
      outputTokens: 120,
    });
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.001234, 6);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('Zed Corp');
    expect(dump).not.toContain('999');
  });

  it("AC-35: another Freelancer's Conversation id is refused exactly like an unknown id and nothing is added to it", async () => {
    const { actor } = await freelancer('t25-a@example.com');
    const other = await createFreelancer(prisma, {
      email: 't25-b@example.com',
      timeZone: TZ,
    });
    const foreign = await createConversation(prisma, {
      userId: other.id,
      messages: [{ role: 'USER' }, { role: 'ASSISTANT' }],
    });
    const input = (id: string): SaveInput => ({
      conversation: { id, isNew: false },
      userText: 'hello',
      assistantParts: reply('hi'),
      turn: TURN,
      proposedCard: { id: `card_for_${id}`, request: {}, proposal: {} },
    });

    const foreignResult = await svc.saveTurn(actor, input(foreign.id));
    const unknownResult = await svc.saveTurn(
      actor,
      input('cnv_does_not_exist')
    );

    expect(foreignResult).toEqual(NOT_FOUND);
    expect(unknownResult).toEqual(NOT_FOUND);
    expect(await messagesOf(foreign.id)).toHaveLength(2);
    expect(await prisma.draftCard.count()).toBe(0);
  });

  it('AC-35: a Conversation deleted in another tab answers NOT_FOUND and leaves only the metadata row', async () => {
    const { user, actor } = await freelancer();

    const result = await svc.saveTurn(actor, {
      conversation: { id: 'cnv_gone', isNew: false },
      userText: 'hello',
      assistantParts: reply('hi'),
      turn: TURN,
    });

    expect(result).toEqual(NOT_FOUND);
    expect(await prisma.conversationMessage.count()).toBe(0);
    const rows = await prisma.assistantTurn.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].conversationId).toBeNull();
  });

  it('AC-35: recordTurnMetadata saves a failed turn as one metadata row, with no Conversation, message or card', async () => {
    const { user, actor } = await freelancer();

    const result = await turns.recordTurnMetadata(actor, {
      ...TURN,
      outcome: 'FAILED',
      counted: false,
      steps: 0,
      toolNames: [],
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
    });

    expect(result.success).toBe(true);
    const rows = await prisma.assistantTurn.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: 'FAILED',
      counted: false,
      conversationId: null,
    });
    expect(await prisma.conversation.count()).toBe(0);
    expect(await prisma.conversationMessage.count()).toBe(0);
    expect(await prisma.draftCard.count()).toBe(0);
  });

  it('AC-35: existing LIVE card of the Conversation stays LIVE when the turn proposes no card', async () => {
    const { user, actor } = await freelancer();
    const conversation = await createConversation(prisma, { userId: user.id });
    const card = await createDraftCard(prisma, {
      userId: user.id,
      conversationId: conversation.id,
    });

    await svc.saveTurn(actor, {
      conversation: { id: conversation.id, isNew: false },
      userText: 'thanks',
      assistantParts: reply('You are welcome.'),
      turn: TURN,
    });

    const stored = await prisma.draftCard.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(stored.state).toBe('LIVE');
  });
});
