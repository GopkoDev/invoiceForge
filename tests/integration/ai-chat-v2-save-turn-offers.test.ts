// ai-chat-v2 T11 (spec.md §5 AC-12, AC-13, AC-18; contracts/server-actions.md §saveTurn, §getConversation,
// §loadConversationCards): saveTurn stores the turn's Offered choices tied to the pre-generated reply, closes the
// Conversation's OPEN offer for a typed/dashboard message (never for a press), writes origin and startedFrom;
// getConversation and loadConversationCards return offers keyed by offerId (no ref, no request).
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createId } from '@paralleldrive/cuid2';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createConversation } from '../support/factories/conversation';
import {
  createChoiceOffer,
  DEFAULT_OFFER_REQUEST,
} from '../support/factories/choice-offer';
import { actingFreelancerForTest } from '../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock =
  vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

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
type Option = { optionId: number; label: string; ref: Record<string, string> };
type OfferInput = {
  id: string;
  kind: string;
  lineIndex: number | null;
  request: unknown;
  options: Option[];
};
type SaveInput = {
  conversation: { id: string; isNew: boolean };
  startedFrom?:
    | 'AI_SECTION'
    | 'INVOICE_LIST'
    | 'DASHBOARD_PROMPT'
    | 'DASHBOARD_CREATE';
  userText: string;
  userOrigin: 'TYPED' | 'PRESSED' | 'DASHBOARD';
  assistantMessageId: string;
  assistantParts: unknown[];
  offer: OfferInput | null;
  turn: Turn;
};
type Saved =
  | { success: true; data: { conversationId: string; title: string } }
  | { success: false; code: string; error?: string };
type OfferView = {
  offerId: string;
  kind: string;
  state: string;
  chosenOptionId: number | null;
  options: Array<{ optionId: number; label: string }>;
};
type Got = {
  success: boolean;
  code?: string;
  data?: {
    messages: Array<{ role: string; origin: string | null }>;
    offers: Record<string, OfferView>;
  };
};
type Svc = {
  saveTurn: (actor: unknown, input: SaveInput) => Promise<Saved>;
  getConversation: (actor: unknown, id: string) => Promise<Got>;
};
type Actions = {
  loadConversationCards: (id: string) => Promise<Got>;
};

const TURN: Turn = {
  topic: 'IN_SCOPE',
  outcome: 'ANSWERED',
  counted: true,
  steps: 2,
  toolNames: ['propose_draft'],
  durationMs: 1800,
  inputTokens: 900,
  outputTokens: 120,
  costUsd: 0.001234,
};

const ACCOUNTS: Option[] = [
  {
    optionId: 0,
    label: 'Mono ••1111 · USD',
    ref: { bankAccountId: 'acc-one' },
  },
  {
    optionId: 1,
    label: 'Mono ••2222 · USD',
    ref: { bankAccountId: 'acc-two' },
  },
  {
    optionId: 2,
    label: 'Priv ••3333 · USD',
    ref: { bankAccountId: 'acc-three' },
  },
];

describe.runIf(containerRuntimeAvailable)(
  'Saving a turn with offers and reopening (T11)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let svc: Svc;
    let actions: Actions;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      svc = (await import('@/lib/services/conversations')) as unknown as Svc;
      actions =
        (await import('@/lib/actions/assistant-actions')) as unknown as Actions;
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      authMock.mockReset();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    async function freelancer(email = 't11-a@example.com') {
      const user = await createFreelancer(prisma, { email, timeZone: TZ });
      return { user, actor: await actingFreelancerForTest(user.id, TZ) };
    }

    function input(
      conversationId: string,
      isNew: boolean,
      over: Partial<SaveInput> = {}
    ): SaveInput {
      const assistantMessageId = over.assistantMessageId ?? createId();
      return {
        conversation: { id: conversationId, isNew },
        userText: 'Invoice Acme for 20 hours',
        userOrigin: 'TYPED',
        assistantMessageId,
        assistantParts: [{ type: 'text', text: 'Which account?' }],
        offer: null,
        turn: TURN,
        ...over,
      };
    }

    function withOffer(
      conversationId: string,
      isNew: boolean,
      over: Partial<SaveInput> = {}
    ): SaveInput & { offer: OfferInput } {
      const assistantMessageId = over.assistantMessageId ?? createId();
      const offer: OfferInput = {
        id: createId(),
        kind: 'BANK_ACCOUNT',
        lineIndex: null,
        request: DEFAULT_OFFER_REQUEST,
        options: ACCOUNTS,
      };
      return input(conversationId, isNew, {
        assistantMessageId,
        assistantParts: [
          { type: 'text', text: 'Which account?' },
          { type: 'data-offer', id: offer.id, data: { offerId: offer.id } },
        ],
        offer,
        ...over,
      }) as SaveInput & { offer: OfferInput };
    }

    async function conversationWithOffer(
      userId: string,
      state: 'OPEN' | 'CHOSEN' | 'CLOSED',
      chosenOptionId: number | null = null
    ) {
      const messageId = createId();
      const offerId = createId();
      const conversation = await createConversation(prisma, {
        userId,
        messages: [
          { role: 'USER' },
          {
            role: 'ASSISTANT',
            id: messageId,
            parts: [
              { type: 'text', text: 'Which account?' },
              { type: 'data-offer', id: offerId, data: { offerId } },
            ],
          },
        ],
      });
      const offer = await createChoiceOffer(prisma, {
        id: offerId,
        userId,
        conversationId: conversation.id,
        messageId,
        kind: 'BANK_ACCOUNT',
        options: ACCOUNTS,
        state,
        chosenOptionId,
      });
      return { conversation, offer };
    }

    const offerStates = async (conversationId: string) =>
      (
        await prisma.choiceOffer.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
        })
      ).map((o) => [o.id, o.state, o.chosenOptionId]);

    it('AC-18: the first message creates the Conversation with the given start point and the message origins', async () => {
      const { user, actor } = await freelancer();
      const req = input('cnv_t11_new', true, {
        startedFrom: 'DASHBOARD_PROMPT',
        userOrigin: 'DASHBOARD',
      });

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: 'cnv_t11_new' },
      });
      expect(conversation.userId).toBe(user.id);
      expect(conversation.startedFrom).toBe('DASHBOARD_PROMPT');
      const messages = await prisma.conversationMessage.findMany({
        where: { conversationId: 'cnv_t11_new' },
        orderBy: { position: 'asc' },
      });
      expect(messages.map((m) => [m.role, m.origin])).toEqual([
        ['USER', 'DASHBOARD'],
        ['ASSISTANT', null],
      ]);
      expect(messages[1].id).toBe(req.assistantMessageId);
    });

    it('AC-18: a new Conversation without a start point starts from the AI section', async () => {
      const { actor } = await freelancer();

      await svc.saveTurn(actor, input('cnv_t11_default', true));

      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: 'cnv_t11_default' },
      });
      expect(conversation.startedFrom).toBe('AI_SECTION');
    });

    it('AC-12: a typed message closes the earlier open offer with no choice and stores the new offer open on the new reply', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer: earlier } = await conversationWithOffer(
        user.id,
        'OPEN'
      );
      const req = withOffer(conversation.id, false);

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      const old = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: earlier.id },
      });
      expect(old.state).toBe('CLOSED');
      expect(old.chosenOptionId).toBeNull();
      const fresh = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: req.offer.id },
      });
      expect(fresh).toMatchObject({
        id: req.offer.id,
        messageId: req.assistantMessageId,
        userId: user.id,
        conversationId: conversation.id,
        kind: 'BANK_ACCOUNT',
        state: 'OPEN',
        chosenOptionId: null,
      });
      expect(fresh.options).toEqual(ACCOUNTS);
      expect(
        await prisma.choiceOffer.count({
          where: { conversationId: conversation.id, state: 'OPEN' },
        })
      ).toBe(1);
    });

    it('AC-12: a dashboard message also closes the earlier open offer', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer: earlier } = await conversationWithOffer(
        user.id,
        'OPEN'
      );

      await svc.saveTurn(
        actor,
        withOffer(conversation.id, false, { userOrigin: 'DASHBOARD' })
      );

      const old = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: earlier.id },
      });
      expect(old.state).toBe('CLOSED');
      expect(
        await prisma.choiceOffer.count({
          where: { conversationId: conversation.id, state: 'OPEN' },
        })
      ).toBe(1);
    });

    it('AC-12: a pressed message leaves the claimed (CHOSEN) offer as it was and stores the new offer open', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer: earlier } = await conversationWithOffer(
        user.id,
        'CHOSEN',
        1
      );
      const req = withOffer(conversation.id, false, { userOrigin: 'PRESSED' });

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      expect(await offerStates(conversation.id)).toEqual([
        [earlier.id, 'CHOSEN', 1],
        [req.offer.id, 'OPEN', null],
      ]);
    });

    // Review 2026-10-13 R2-B1: another tab stored an OPEN offer while the press ran. The pressed message is newer, so
    // that offer closes, and the press's own next offer is stored without breaking the one-open-offer rule.
    it('AC-12: a pressed message closes an offer another tab stored meanwhile and stores its own open', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer: claimed } = await conversationWithOffer(user.id, 'CHOSEN', 1);
      const otherReply = await prisma.conversationMessage.create({
        data: { conversationId: conversation.id, position: 10, role: 'ASSISTANT', parts: [] },
      });
      const other = await createChoiceOffer(prisma, {
        userId: user.id,
        conversationId: conversation.id,
        messageId: otherReply.id,
        kind: 'BANK_ACCOUNT',
        options: ACCOUNTS,
      });
      const req = withOffer(conversation.id, false, { userOrigin: 'PRESSED' });

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      expect(await offerStates(conversation.id)).toEqual(
        expect.arrayContaining([
          [claimed.id, 'CHOSEN', 1],
          [other.id, 'CLOSED', null],
          [req.offer.id, 'OPEN', null],
        ])
      );
    });

    it('AC-12: a typed turn with no offer still closes the open offer and stores no offer row', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer: earlier } = await conversationWithOffer(
        user.id,
        'OPEN'
      );

      const result = await svc.saveTurn(actor, input(conversation.id, false));

      expect(result.success).toBe(true);
      expect(await offerStates(conversation.id)).toEqual([
        [earlier.id, 'CLOSED', null],
      ]);
    });

    it("AC-12: saving to another Freelancer's or an unknown Conversation is NOT_FOUND and closes nothing", async () => {
      const { actor } = await freelancer('t11-a@example.com');
      const other = await createFreelancer(prisma, {
        email: 't11-b@example.com',
        timeZone: TZ,
      });
      const { conversation, offer } = await conversationWithOffer(
        other.id,
        'OPEN'
      );

      const foreign = await svc.saveTurn(
        actor,
        withOffer(conversation.id, false)
      );
      const unknown = await svc.saveTurn(
        actor,
        withOffer('cnv_t11_missing', false)
      );

      expect(foreign).toEqual(NOT_FOUND);
      expect(unknown).toEqual(NOT_FOUND);
      expect(await offerStates(conversation.id)).toEqual([
        [offer.id, 'OPEN', null],
      ]);
      expect(await prisma.choiceOffer.count()).toBe(1);
    });

    it('AC-12: offer options are stored exactly as given', async () => {
      const { actor } = await freelancer();
      const req = withOffer('cnv_t11_opts', true, {});

      await svc.saveTurn(actor, req);

      const stored = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: req.offer.id },
      });
      expect(stored.options).toEqual(ACCOUNTS);
      expect(stored.lineIndex).toBeNull();
      expect(stored.request).toEqual(DEFAULT_OFFER_REQUEST);
    });

    it.each([
      [
        'nine options',
        Array.from({ length: 9 }, (_, i) => ({
          optionId: i,
          label: `Acc ${i}`,
          ref: { bankAccountId: `acc-${i}` },
        })),
      ],
      [
        'a ref with two keys',
        [
          {
            optionId: 0,
            label: 'Bad',
            ref: { bankAccountId: 'a', customerId: 'b' },
          },
        ],
      ],
    ])(
      'AC-12: an invalid options payload (%s) fails the save and writes nothing',
      async (_name, options) => {
        const { actor } = await freelancer();
        const req = withOffer('cnv_t11_bad', true);
        req.offer.options = options;

        const result = await svc.saveTurn(actor, req);

        expect(result.success).toBe(false);
        expect(await prisma.conversation.count()).toBe(0);
        expect(await prisma.conversationMessage.count()).toBe(0);
        expect(await prisma.choiceOffer.count()).toBe(0);
      }
    );

    it('AC-13: reopening returns the offers by id with label-only options and the chosen one marked, never ref or request', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer } = await conversationWithOffer(
        user.id,
        'CHOSEN',
        1
      );

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.success).toBe(true);
      expect(result.data!.offers).toEqual({
        [offer.id]: {
          offerId: offer.id,
          kind: 'BANK_ACCOUNT',
          state: 'CHOSEN',
          chosenOptionId: 1,
          options: [
            { optionId: 0, label: 'Mono ••1111 · USD' },
            { optionId: 1, label: 'Mono ••2222 · USD' },
            { optionId: 2, label: 'Priv ••3333 · USD' },
          ],
        },
      });
    });

    it('AC-13: a closed offer reopens as CLOSED with no choice', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer } = await conversationWithOffer(
        user.id,
        'CLOSED'
      );

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.data!.offers[offer.id]).toMatchObject({
        state: 'CLOSED',
        chosenOptionId: null,
      });
    });

    it('AC-13: reopened messages carry origin; a USER row with no origin reads TYPED, the reply null', async () => {
      const { user, actor } = await freelancer();
      const conversation = await createConversation(prisma, {
        userId: user.id,
        messages: [
          { role: 'USER', origin: 'PRESSED' },
          { role: 'ASSISTANT' },
          { role: 'USER', origin: null },
          { role: 'ASSISTANT' },
        ],
      });

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.data!.messages.map((m) => [m.role, m.origin])).toEqual([
        ['user', 'PRESSED'],
        ['assistant', null],
        ['user', 'TYPED'],
        ['assistant', null],
      ]);
    });

    it("AC-13: another Freelancer's Conversation is NOT_FOUND and its offers are never returned", async () => {
      const { actor } = await freelancer('t11-a@example.com');
      const mine = await createFreelancer(prisma, {
        email: 't11-own@example.com',
        timeZone: TZ,
      });
      const other = await createFreelancer(prisma, {
        email: 't11-b@example.com',
        timeZone: TZ,
      });
      const { conversation: foreign } = await conversationWithOffer(
        other.id,
        'OPEN'
      );
      const own = await createConversation(prisma, {
        userId: (
          await prisma.user.findFirstOrThrow({
            where: { email: 't11-a@example.com' },
          })
        ).id,
        messages: [{ role: 'USER' }, { role: 'ASSISTANT' }],
      });
      void mine;

      const denied = await svc.getConversation(actor, foreign.id);
      const ownRead = await svc.getConversation(actor, own.id);

      expect(denied).toEqual(NOT_FOUND);
      expect(ownRead.data!.offers).toEqual({});
    });

    it('AC-13: reopening writes nothing', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer } = await conversationWithOffer(
        user.id,
        'OPEN'
      );
      const before = {
        offer: await prisma.choiceOffer.findUniqueOrThrow({
          where: { id: offer.id },
        }),
        conversation: await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        }),
        turns: await prisma.assistantTurn.count(),
        allowance: await prisma.messageAllowanceDay.count(),
      };

      const read = await svc.getConversation(actor, conversation.id);

      expect(read.success).toBe(true);
      expect(
        await prisma.choiceOffer.findUniqueOrThrow({ where: { id: offer.id } })
      ).toEqual(before.offer);
      expect(
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).toEqual(before.conversation);
      expect(await prisma.assistantTurn.count()).toBe(before.turns);
      expect(await prisma.messageAllowanceDay.count()).toBe(before.allowance);
    });

    it('AC-13: loadConversationCards returns the same offers as getConversation', async () => {
      const { user, actor } = await freelancer();
      authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
      const { conversation, offer } = await conversationWithOffer(
        user.id,
        'CHOSEN',
        1
      );

      const cards = await actions.loadConversationCards(conversation.id);
      const full = await svc.getConversation(actor, conversation.id);

      expect(cards.success).toBe(true);
      expect(Object.keys(cards.data!.offers)).toEqual([offer.id]);
      expect(cards.data!.offers).toEqual(full.data!.offers);
    });
  }
);
