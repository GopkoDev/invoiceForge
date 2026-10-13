// ai-chat-v2 T11, rewritten for the Question form by T55 (spec.md §5 AC-12, AC-13, AC-18; contracts/server-actions.md
// §saveTurn, §getConversation, §loadConversationCards, Revision 2026-10-13): saveTurn stores the turn's one Question form
// (kind FORM, questions, request or NULL) tied to the pre-generated reply, closes the Conversation's OPEN row for any
// new message (answers NULL; for a press, only a row another tab stored: its own is CHOSEN; review 2026-10-13 R2-B1),
// writes origin and startedFrom; getConversation and loadConversationCards return forms keyed by formId (FormView: no
// ref, no source, no request; answers only once sent; a legacy offer reads as a one-question form).
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
  createQuestionForm,
  DEFAULT_OFFER_REQUEST,
  defaultFormQuestions,
  type FixtureFormQuestion,
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
type FormInput = {
  id: string;
  request: unknown;
  questions: FixtureFormQuestion[];
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
  form: FormInput | null;
  turn: Turn;
};
type Saved =
  | { success: true; data: { conversationId: string; title: string } }
  | { success: false; code: string; error?: string };
type FormView = {
  formId: string;
  state: string;
  questions: Array<Record<string, unknown> & { questionId: number; field: string; options: Array<{ optionId: number; label: string }> }>;
  answers: unknown[] | null;
};
type Got = {
  success: boolean;
  code?: string;
  data?: {
    messages: Array<{ role: string; origin: string | null }>;
    forms: Record<string, FormView>;
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

/** A BANK_ACCOUNT question of three options and a typed-price question (the AC-13 form). */
function accountForm(): FixtureFormQuestion[] {
  return [
    {
      questionId: 0,
      field: 'BANK_ACCOUNT',
      lineIndex: null,
      heading: 'Bank account',
      prompt: null,
      options: ACCOUNTS.map((o) => ({ optionId: o.optionId, label: o.label, ref: o.ref })),
      input: 'TEXT',
      required: true,
      skippable: false,
      matchCount: null,
      source: 'RESOLVER',
    },
    {
      questionId: 1,
      field: 'PRICE',
      lineIndex: 0,
      heading: 'Line 1 · Price',
      prompt: null,
      options: [],
      input: 'AMOUNT',
      required: true,
      skippable: false,
      matchCount: null,
      source: 'CHAT',
    },
  ];
}

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
  'Saving a turn with a Question form and reopening (T11, T55)',
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
        form: null,
        turn: TURN,
        ...over,
      };
    }

    function withForm(
      conversationId: string,
      isNew: boolean,
      over: Partial<SaveInput> = {}
    ): SaveInput & { form: FormInput } {
      const assistantMessageId = over.assistantMessageId ?? createId();
      const form: FormInput = {
        id: createId(),
        request: DEFAULT_OFFER_REQUEST,
        questions: defaultFormQuestions(),
      };
      return input(conversationId, isNew, {
        assistantMessageId,
        assistantParts: [
          { type: 'text', text: 'Which account?' },
          { type: 'data-offer', id: form.id, data: { offerId: form.id } },
        ],
        form,
        ...over,
      }) as SaveInput & { form: FormInput };
    }

    /** A Conversation whose latest reply carries one stored form (kind FORM). */
    async function conversationWithForm(
      userId: string,
      state: 'OPEN' | 'CHOSEN' | 'CLOSED',
      over: {
        questions?: FixtureFormQuestion[];
        answers?: unknown[] | null;
        request?: Record<string, unknown> | null;
      } = {}
    ) {
      const messageId = createId();
      const formId = createId();
      const conversation = await createConversation(prisma, {
        userId,
        messages: [
          { role: 'USER' },
          {
            role: 'ASSISTANT',
            id: messageId,
            parts: [
              { type: 'text', text: 'Which account?' },
              { type: 'data-offer', id: formId, data: { offerId: formId } },
            ],
          },
        ],
      });
      const form = await createQuestionForm(prisma, {
        id: formId,
        userId,
        conversationId: conversation.id,
        messageId,
        state,
        questions: over.questions,
        answers: (over.answers ?? null) as never,
        ...(over.request !== undefined ? { request: over.request as never } : {}),
      });
      return { conversation, form };
    }

    /** A pre-revision Conversation: one legacy BANK_ACCOUNT offer on the latest reply. */
    async function conversationWithLegacyOffer(
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

    const rowStates = async (conversationId: string) =>
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

    it('AC-12: a typed message closes the earlier open form with no answers and stores the new form open on the new reply', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form: earlier } = await conversationWithForm(
        user.id,
        'OPEN'
      );
      const req = withForm(conversation.id, false);

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      const old = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: earlier.id },
      });
      expect(old.state).toBe('CLOSED');
      expect(old.chosenOptionId).toBeNull();
      expect(old.answers).toBeNull();
      const fresh = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: req.form.id },
      });
      expect(fresh).toMatchObject({
        id: req.form.id,
        messageId: req.assistantMessageId,
        userId: user.id,
        conversationId: conversation.id,
        kind: 'FORM',
        state: 'OPEN',
        chosenOptionId: null,
      });
      expect(fresh.answers).toBeNull();
      expect(
        await prisma.choiceOffer.count({
          where: { conversationId: conversation.id, state: 'OPEN' },
        })
      ).toBe(1);
    });

    it('AC-12: a dashboard message also closes the earlier open form', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form: earlier } = await conversationWithForm(
        user.id,
        'OPEN'
      );

      await svc.saveTurn(
        actor,
        withForm(conversation.id, false, { userOrigin: 'DASHBOARD' })
      );

      const old = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: earlier.id },
      });
      expect(old.state).toBe('CLOSED');
      expect(old.answers).toBeNull();
      expect(
        await prisma.choiceOffer.count({
          where: { conversationId: conversation.id, state: 'OPEN' },
        })
      ).toBe(1);
    });

    it('AC-12: a pressed message leaves the claimed (CHOSEN) row as it was and stores the new form open', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer: earlier } = await conversationWithLegacyOffer(
        user.id,
        'CHOSEN',
        1
      );
      const req = withForm(conversation.id, false, { userOrigin: 'PRESSED' });

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      expect(await rowStates(conversation.id)).toEqual([
        [earlier.id, 'CHOSEN', 1],
        [req.form.id, 'OPEN', null],
      ]);
    });

    // Review 2026-10-13 R2-B1: another tab stored an OPEN form while the press ran. The pressed message is newer, so
    // that form closes, and the press's own next form is stored without breaking the one-open-row rule.
    it('AC-12: a pressed message closes a form another tab stored meanwhile and stores its own open', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer: claimed } = await conversationWithLegacyOffer(user.id, 'CHOSEN', 1);
      const otherReply = await prisma.conversationMessage.create({
        data: { conversationId: conversation.id, position: 10, role: 'ASSISTANT', parts: [] },
      });
      const other = await createQuestionForm(prisma, {
        userId: user.id,
        conversationId: conversation.id,
        messageId: otherReply.id,
      });
      const req = withForm(conversation.id, false, { userOrigin: 'PRESSED' });

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      expect(await rowStates(conversation.id)).toEqual(
        expect.arrayContaining([
          [claimed.id, 'CHOSEN', 1],
          [other.id, 'CLOSED', null],
          [req.form.id, 'OPEN', null],
        ])
      );
    });

    it('AC-12: a typed turn with no form still closes the open form and stores no new row', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form: earlier } = await conversationWithForm(
        user.id,
        'OPEN'
      );

      const result = await svc.saveTurn(actor, input(conversation.id, false));

      expect(result.success).toBe(true);
      expect(await rowStates(conversation.id)).toEqual([
        [earlier.id, 'CLOSED', null],
      ]);
    });

    it("AC-12: saving to another Freelancer's or an unknown Conversation is NOT_FOUND and closes nothing", async () => {
      const { actor } = await freelancer('t11-a@example.com');
      const other = await createFreelancer(prisma, {
        email: 't11-b@example.com',
        timeZone: TZ,
      });
      const { conversation, form } = await conversationWithForm(
        other.id,
        'OPEN'
      );

      const foreign = await svc.saveTurn(
        actor,
        withForm(conversation.id, false)
      );
      const unknown = await svc.saveTurn(
        actor,
        withForm('cnv_t11_missing', false)
      );

      expect(foreign).toEqual(NOT_FOUND);
      expect(unknown).toEqual(NOT_FOUND);
      expect(await rowStates(conversation.id)).toEqual([
        [form.id, 'OPEN', null],
      ]);
      expect(await prisma.choiceOffer.count()).toBe(1);
    });

    it('AC-12: the form is stored as given: kind FORM, questions and request as given, options empty, no answers', async () => {
      const { actor } = await freelancer();
      const req = withForm('cnv_t11_opts', true, {});

      await svc.saveTurn(actor, req);

      const stored = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: req.form.id },
      });
      expect(stored.kind).toBe('FORM');
      expect(stored.questions).toEqual(req.form.questions);
      expect(stored.request).toEqual(DEFAULT_OFFER_REQUEST);
      expect(stored.options).toEqual([]);
      expect(stored.answers).toBeNull();
      expect(stored.lineIndex).toBeNull();
    });

    it('AC-37: a free-question form is stored with request NULL', async () => {
      const { actor } = await freelancer();
      const req = withForm('cnv_t11_free', true);
      req.form.request = null;

      const result = await svc.saveTurn(actor, req);

      expect(result.success).toBe(true);
      const stored = await prisma.choiceOffer.findUniqueOrThrow({
        where: { id: req.form.id },
      });
      expect(stored.kind).toBe('FORM');
      expect(stored.request).toBeNull();
      expect(stored.state).toBe('OPEN');
    });

    it.each([
      [
        'seven questions',
        Array.from({ length: 7 }, (_, i) => ({
          ...defaultFormQuestions()[1],
          questionId: i,
          lineIndex: i,
        })),
      ],
      [
        'a ref with two keys',
        [
          {
            ...defaultFormQuestions()[0],
            options: [
              {
                optionId: 0,
                label: 'Bad',
                ref: { bankAccountId: 'a', customerId: 'b' },
              },
            ],
          },
        ],
      ],
      ['no question', []],
    ])(
      'AC-12: an invalid questions payload (%s) fails the save and writes nothing',
      async (_name, questions) => {
        const { actor } = await freelancer();
        const req = withForm('cnv_t11_bad', true);
        // The save validates with storedFormQuestionsSchema; the fixtures here are deliberately outside it.
        req.form.questions = questions as unknown as FixtureFormQuestion[];

        const result = await svc.saveTurn(actor, req);

        expect(result.success).toBe(false);
        expect(await prisma.conversation.count()).toBe(0);
        expect(await prisma.conversationMessage.count()).toBe(0);
        expect(await prisma.choiceOffer.count()).toBe(0);
      }
    );

    it('AC-13: reopening returns the form by id with label-only options, the sent answers (an option and a typed price), never ref, source or request', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await conversationWithForm(
        user.id,
        'CHOSEN',
        {
          questions: accountForm(),
          answers: [
            { questionId: 0, optionId: 1 },
            { questionId: 1, text: '55' },
          ],
        }
      );

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.success).toBe(true);
      expect(result.data!.forms).toEqual({
        [form.id]: {
          formId: form.id,
          state: 'CHOSEN',
          questions: [
            {
              questionId: 0,
              field: 'BANK_ACCOUNT',
              lineIndex: null,
              heading: 'Bank account',
              prompt: null,
              options: [
                { optionId: 0, label: 'Mono ••1111 · USD' },
                { optionId: 1, label: 'Mono ••2222 · USD' },
                { optionId: 2, label: 'Priv ••3333 · USD' },
              ],
              input: 'TEXT',
              required: true,
              skippable: false,
              matchCount: null,
            },
            {
              questionId: 1,
              field: 'PRICE',
              lineIndex: 0,
              heading: 'Line 1 · Price',
              prompt: null,
              options: [],
              input: 'AMOUNT',
              required: true,
              skippable: false,
              matchCount: null,
            },
          ],
          answers: [
            { questionId: 0, optionId: 1 },
            { questionId: 1, text: '55' },
          ],
        },
      });
      const wire = JSON.stringify(result.data!.forms);
      expect(wire).not.toContain('bankAccountId');
      expect(wire).not.toContain('"source"');
      expect(wire).not.toContain('"request"');
    });

    it('AC-12 / AC-13: a form skipped by a typed message reopens CLOSED with no answers', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await conversationWithForm(
        user.id,
        'OPEN'
      );
      await svc.saveTurn(actor, input(conversation.id, false));

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.data!.forms[form.id]).toMatchObject({
        formId: form.id,
        state: 'CLOSED',
        answers: null,
      });
    });

    it('AC-13: an unsent form still OPEN reopens with its questions and no answers', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await conversationWithForm(
        user.id,
        'OPEN'
      );

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.data!.forms[form.id]).toMatchObject({
        state: 'OPEN',
        answers: null,
      });
      expect(result.data!.forms[form.id].questions).toHaveLength(2);
    });

    it('AC-13: a legacy CHOSEN offer reopens as a one-question form with the chosen option as its answer', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer } = await conversationWithLegacyOffer(
        user.id,
        'CHOSEN',
        1
      );

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.data!.forms[offer.id]).toMatchObject({
        formId: offer.id,
        state: 'CHOSEN',
        answers: [{ questionId: 0, optionId: 1 }],
      });
      expect(result.data!.forms[offer.id].questions).toHaveLength(1);
      expect(result.data!.forms[offer.id].questions[0]).toMatchObject({
        questionId: 0,
        field: 'BANK_ACCOUNT',
      });
      expect(
        result.data!.forms[offer.id].questions[0].options.map((o) => o.label)
      ).toEqual([
        'Mono ••1111 · USD',
        'Mono ••2222 · USD',
        'Priv ••3333 · USD',
      ]);
    });

    it('AC-13: a legacy closed offer reopens as a CLOSED one-question form with no answers', async () => {
      const { user, actor } = await freelancer();
      const { conversation, offer } = await conversationWithLegacyOffer(
        user.id,
        'CLOSED'
      );

      const result = await svc.getConversation(actor, conversation.id);

      expect(result.data!.forms[offer.id]).toMatchObject({
        state: 'CLOSED',
        answers: null,
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

    it("AC-13: another Freelancer's Conversation is NOT_FOUND and its forms are never returned", async () => {
      const { actor } = await freelancer('t11-a@example.com');
      const other = await createFreelancer(prisma, {
        email: 't11-b@example.com',
        timeZone: TZ,
      });
      const { conversation: foreign } = await conversationWithForm(
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

      const denied = await svc.getConversation(actor, foreign.id);
      const ownRead = await svc.getConversation(actor, own.id);

      expect(denied).toEqual(NOT_FOUND);
      expect(ownRead.data!.forms).toEqual({});
    });

    it('AC-13: reopening writes nothing', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await conversationWithForm(
        user.id,
        'OPEN'
      );
      const before = {
        form: await prisma.choiceOffer.findUniqueOrThrow({
          where: { id: form.id },
        }),
        conversation: await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        }),
        turns: await prisma.assistantTurn.count(),
        allowance: await prisma.messageAllowanceDay.count(),
      };

      const read = await svc.getConversation(actor, conversation.id);

      expect(read.success).toBe(true);
      expect(read.data!.forms[form.id]).toBeDefined();
      expect(
        await prisma.choiceOffer.findUniqueOrThrow({ where: { id: form.id } })
      ).toEqual(before.form);
      expect(
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).toEqual(before.conversation);
      expect(await prisma.assistantTurn.count()).toBe(before.turns);
      expect(await prisma.messageAllowanceDay.count()).toBe(before.allowance);
    });

    it('AC-13: loadConversationCards returns the same forms as getConversation', async () => {
      const { user, actor } = await freelancer();
      authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
      const { conversation, form } = await conversationWithForm(
        user.id,
        'CHOSEN',
        { questions: accountForm(), answers: [{ questionId: 0, optionId: 2 }, { questionId: 1, skipped: true }] }
      );

      const cards = await actions.loadConversationCards(conversation.id);
      const full = await svc.getConversation(actor, conversation.id);

      expect(cards.success).toBe(true);
      expect(Object.keys(cards.data!.forms)).toEqual([form.id]);
      expect(cards.data!.forms).toEqual(full.data!.forms);
    });
  }
);
