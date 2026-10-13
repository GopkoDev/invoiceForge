// ai-chat-v2 revision 2026-10-13 T56 (spec §1 F5-F9a, §5 AC-11, AC-12b, AC-13; ADR-0011 "Submit"; sad.md §5 "Form
// check"; contracts/server-actions.md): the server-side gate for a sent Question form. checkForm is read-only and answers
// { ok: false, kind: 'UNAVAILABLE' } the same way for every cause, INVALID with per-question messages only after the
// structural check passed; claimForm / releaseForm move OPEN <-> CHOSEN with the answers; reserveAndClaimForm takes the
// allowance slot and claims the form in ONE transaction. Request-free (no route): the actor is built from raw values.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createId } from '@paralleldrive/cuid2';
import { Prisma, type PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createConversation } from '../../../support/factories/conversation';
import {
  createChoiceOffer,
  createQuestionForm,
  type FixtureFormQuestion,
} from '../../../support/factories/choice-offer';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createProduct } from '../../../support/factories/product';
import { createMessageAllowanceDay } from '../../../support/factories/message-allowance-day';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { ANSWER_MESSAGES } from '@/lib/validations/form-answers';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@/auth', () => ({ auth: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const TZ = 'Europe/Kyiv';
const UNAVAILABLE = { ok: false, kind: 'UNAVAILABLE' } as const;

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type Answer = { questionId: number; optionId: number } | { questionId: number; text: string } | { questionId: number; skipped: true };
type Check =
  | { ok: true; form: { id: string; request: unknown; questions: unknown }; answers: Answer[] }
  | { ok: false; kind: 'UNAVAILABLE' }
  | { ok: false; kind: 'INVALID'; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: 'FAILED' };
type Reserve =
  | { ok: true; state: { used: number }; release: () => Promise<{ used: number }> }
  | { ok: false; usedUp: { kind: string } }
  | { ok: false; claimLost: true }
  | { ok: false; unavailable: true };
type Svc = {
  checkForm: (actor: Actor, input: { conversationId: string; form: { formId: string; answers: Answer[] } }) => Promise<Check>;
  claimForm: (tx: Tx, actor: Actor, formId: string, answers: Answer[]) => Promise<boolean>;
  releaseForm: (tx: Tx, formId: string) => Promise<void>;
  reserveAndClaimForm: (actor: Actor, now: Date, formId: string, answers: Answer[]) => Promise<Reserve>;
};

const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

/** A stored question with the app's usual defaults; `over` changes what a test is about. */
function q(questionId: number, field: string, over: Partial<FixtureFormQuestion> = {}): FixtureFormQuestion {
  return {
    questionId,
    field,
    lineIndex: null,
    heading: `Heading ${questionId}`,
    prompt: null,
    options: [],
    input: 'TEXT',
    required: true,
    skippable: false,
    matchCount: null,
    source: 'RESOLVER',
    ...over,
  };
}

describe.runIf(containerRuntimeAvailable)('Checking, claiming and releasing a sent Question form (T56)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let allowanceDay: (now: Date) => Date;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/forms')) as unknown as Svc;
    const cal = await import('@/lib/helpers/calendar-day');
    allowanceDay = (now) => cal.dayToUtcDate(cal.todayInZone(TZ, now));
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  async function freelancer(email = 't56-a@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    return { user, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  /** The Conversation's latest reply carries the form. */
  async function formFor(
    userId: string,
    opts: {
      questions: FixtureFormQuestion[];
      request?: Record<string, unknown> | null;
      state?: 'OPEN' | 'CHOSEN' | 'CLOSED';
      answers?: Answer[] | null;
    }
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
            { type: 'text', text: 'A few questions.' },
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
      questions: opts.questions,
      request: (opts.request === undefined ? { customer: 'Acme', currency: 'USD', lines: [{ description: 'Design', quantity: '1' }] } : opts.request) as never,
      state: opts.state,
      answers: opts.answers as never,
    });
    return { conversation, form };
  }

  /** A pre-revision offer row (kind = the field), backfilled as one question by migration 08. */
  async function legacyFor(
    userId: string,
    opts: {
      kind?: 'CUSTOMER' | 'BANK_ACCOUNT' | 'SENDER_PROFILE' | 'PRODUCT' | 'CURRENCY';
      refs: Array<Record<string, string>>;
      request?: Record<string, unknown>;
      state?: 'OPEN' | 'CHOSEN' | 'CLOSED';
      chosenOptionId?: number | null;
      lineIndex?: number | null;
    }
  ) {
    const messageId = createId();
    const offerId = createId();
    const conversation = await createConversation(prisma, {
      userId,
      messages: [
        { role: 'USER' },
        { role: 'ASSISTANT', id: messageId, parts: [{ type: 'data-offer', id: offerId, data: { offerId } }] },
      ],
    });
    const kind = opts.kind ?? 'CUSTOMER';
    const options = opts.refs.map((ref, optionId) => ({ optionId, label: `Option ${optionId}`, ref }));
    const offer = await createChoiceOffer(prisma, {
      id: offerId,
      userId,
      conversationId: conversation.id,
      messageId,
      kind,
      lineIndex: opts.lineIndex ?? null,
      request: (opts.request ?? { customer: 'Acme', currency: 'USD' }) as never,
      options,
      state: opts.state,
      chosenOptionId: opts.chosenOptionId,
    });
    const chosen = opts.chosenOptionId ?? null;
    await prisma.choiceOffer.update({
      where: { id: offer.id },
      data: {
        questions: [
          {
            questionId: 0,
            field: kind,
            lineIndex: opts.lineIndex ?? null,
            prompt: null,
            options,
            input: 'NONE',
            required: true,
            skippable: false,
            matchCount: null,
            source: 'RESOLVER',
          },
        ] as unknown as Prisma.InputJsonValue,
        answers: chosen === null ? Prisma.DbNull : ([{ questionId: 0, optionId: chosen }] as Prisma.InputJsonValue),
      },
    });
    return { conversation, offer };
  }

  const check = (actor: Actor, conversationId: string, formId: string, answers: Answer[]) =>
    svc.checkForm(actor, { conversationId, form: { formId, answers } });
  const row = (id: string) => prisma.choiceOffer.findUniqueOrThrow({ where: { id } });
  const usedOf = async (userId: string) => (await prisma.messageAllowanceDay.findFirstOrThrow({ where: { userId } })).used;

  /** Two Customers and a typed price: the default shape of a "which Acme and what price" form. */
  async function customerPriceForm(userId: string, over: { state?: 'OPEN' | 'CHOSEN' | 'CLOSED' } = {}) {
    const a = await createCustomer(prisma, userId, { name: 'Acme Corp' });
    const b = await createCustomer(prisma, userId, { name: 'Acme GmbH' });
    const questions = [
      q(0, 'CUSTOMER', {
        options: [
          { optionId: 0, label: 'Acme Corp', ref: { customerId: a.id } },
          { optionId: 1, label: 'Acme GmbH', ref: { customerId: b.id } },
        ],
      }),
      q(1, 'PRICE', { lineIndex: 0, input: 'AMOUNT' }),
    ];
    const made = await formFor(userId, { questions, state: over.state });
    return { ...made, questions, a, b };
  }

  const valid: Answer[] = [
    { questionId: 0, optionId: 1 },
    { questionId: 1, text: '45.50' },
  ];

  // ---- positive ---------------------------------------------------------------------------------------------------

  it('AC-12b: a valid press is ok with the stored questions, the stored request and the answers', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form, questions } = await customerPriceForm(user.id);

    const r = await check(actor, conversation.id, form.id, valid);

    expect(r).toEqual({
      ok: true,
      form: { id: form.id, request: form.request, questions },
      answers: valid,
    });
  });

  it('AC-12b: an optional question may be skipped or left out; a typed "Other…" answer to a record question is ok', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await formFor(user.id, {
      questions: [
        q(0, 'CUSTOMER'),
        q(1, 'NOTES', { required: false, skippable: true }),
        q(2, 'PO_NUMBER', { required: false, skippable: true }),
      ],
    });

    const r = await check(actor, conversation.id, form.id, [
      { questionId: 0, text: 'Newco Ltd' },
      { questionId: 1, skipped: true },
    ]);

    expect(r.ok).toBe(true);
  });

  it('AC-12b: a picked issue-date option and a due date typed after it are ok', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await formFor(user.id, {
      questions: [
        q(0, 'ISSUE_DATE', { input: 'DATE', options: [{ optionId: 0, label: 'Today', ref: { date: '2026-10-13' } }] }),
        q(1, 'DUE_DATE', { input: 'DATE' }),
      ],
    });

    const r = await check(actor, conversation.id, form.id, [
      { questionId: 0, optionId: 0 },
      { questionId: 1, text: '2026-11-13' },
    ]);

    expect(r.ok).toBe(true);
  });

  it('AC-12b: a valid BANK_ACCOUNT pick (request currency and sender profile) is ok', async () => {
    const { user, actor } = await freelancer();
    const sp = await createSenderProfile(prisma, user.id);
    const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'BANK_ACCOUNT', { options: [{ optionId: 0, label: 'Mono', ref: { bankAccountId: acc.id } }] })],
      request: { customer: 'Acme', currency: 'USD', senderProfileId: sp.id },
    });

    expect((await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).ok).toBe(true);
  });

  // ---- each UNAVAILABLE cause: the same object ---------------------------------------------------------------------

  it('AC-12b: an unknown form id and another Freelancer\'s form are the very same result', async () => {
    const { user, actor } = await freelancer('t56-a@example.com');
    const mine = await customerPriceForm(user.id);
    const other = await createFreelancer(prisma, { email: 't56-b@example.com', timeZone: TZ });
    const theirs = await customerPriceForm(other.id);

    const unknown = await check(actor, mine.conversation.id, 'form_missing', valid);
    const foreign = await check(actor, theirs.conversation.id, theirs.form.id, valid);
    const foreignInMyConversation = await check(actor, mine.conversation.id, theirs.form.id, valid);

    expect(unknown).toStrictEqual(UNAVAILABLE);
    expect(foreign).toStrictEqual(unknown);
    expect(foreignInMyConversation).toStrictEqual(unknown);
    expect(await row(theirs.form.id)).toMatchObject({ state: 'OPEN' });
  });

  it('AC-12b: a form of another Conversation of the same Freelancer is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const { form } = await customerPriceForm(user.id);
    const elsewhere = await createConversation(prisma, { userId: user.id, messages: [{ role: 'USER' }, { role: 'ASSISTANT' }] });

    expect(await check(actor, elsewhere.id, form.id, valid)).toStrictEqual(UNAVAILABLE);
  });

  it.each(['CLOSED', 'CHOSEN'] as const)('AC-12b: a %s form is UNAVAILABLE', async (state) => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id, { state });

    expect(await check(actor, conversation.id, form.id, valid)).toStrictEqual(UNAVAILABLE);
  });

  it('AC-12b: a question id the form does not hold is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id);

    expect(await check(actor, conversation.id, form.id, [...valid, { questionId: 7, text: '1' }])).toStrictEqual(UNAVAILABLE);
  });

  it('AC-12b: an option id the question does not hold is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id);

    expect(
      await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 5 }, { questionId: 1, text: '45' }])
    ).toStrictEqual(UNAVAILABLE);
  });

  it('AC-12b: an option picked on a question that holds no options is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id);

    expect(
      await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }, { questionId: 1, optionId: 0 }])
    ).toStrictEqual(UNAVAILABLE);
  });

  it('AC-12b: a text answer on a question with input NONE is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const c = await createCustomer(prisma, user.id);
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'CUSTOMER', { input: 'NONE', options: [{ optionId: 0, label: 'Acme', ref: { customerId: c.id } }] })],
    });

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, text: 'Other Co' }])).toStrictEqual(UNAVAILABLE);
  });

  it('AC-12b: a skip on a non-skippable question is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id);

    expect(
      await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }, { questionId: 1, skipped: true }])
    ).toStrictEqual(UNAVAILABLE);
  });

  it('AC-12b: a required question left unanswered is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id);

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it("AC-12b: a pick naming another Freelancer's Customer is UNAVAILABLE", async () => {
    const { user, actor } = await freelancer('t56-a@example.com');
    const other = await createFreelancer(prisma, { email: 't56-b@example.com', timeZone: TZ });
    const theirs = await createCustomer(prisma, other.id);
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'CUSTOMER', { options: [{ optionId: 0, label: 'Foreign', ref: { customerId: theirs.id } }] })],
    });

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it('AC-13: a Customer deleted since is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form, b } = await customerPriceForm(user.id);
    await prisma.customer.delete({ where: { id: b.id } });

    expect(await check(actor, conversation.id, form.id, valid)).toStrictEqual(UNAVAILABLE);
  });

  it('AC-13: a sender profile deleted since is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const sp = await createSenderProfile(prisma, user.id);
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'SENDER_PROFILE', { options: [{ optionId: 0, label: 'Main', ref: { senderProfileId: sp.id } }] })],
    });
    await prisma.senderProfile.delete({ where: { id: sp.id } });

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it('AC-13: a bank account deleted since is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const sp = await createSenderProfile(prisma, user.id);
    const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'BANK_ACCOUNT', { options: [{ optionId: 0, label: 'Mono', ref: { bankAccountId: acc.id } }] })],
    });
    await prisma.bankAccount.delete({ where: { id: acc.id } });

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it("AC-13: a bank account now in another currency than the stored request's is UNAVAILABLE", async () => {
    const { user, actor } = await freelancer();
    const sp = await createSenderProfile(prisma, user.id);
    const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'BANK_ACCOUNT', { options: [{ optionId: 0, label: 'Mono', ref: { bankAccountId: acc.id } }] })],
      request: { customer: 'Acme', currency: 'USD', senderProfileId: sp.id },
    });
    expect((await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).ok).toBe(true);
    await prisma.bankAccount.update({ where: { id: acc.id }, data: { currency: 'EUR' } });

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it("AC-13: a bank account of another sender profile than the stored request's is UNAVAILABLE", async () => {
    const { user, actor } = await freelancer();
    const wanted = await createSenderProfile(prisma, user.id);
    const second = await createSenderProfile(prisma, user.id);
    const acc = await createBankAccount(prisma, second.id, { currency: 'USD' });
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'BANK_ACCOUNT', { options: [{ optionId: 0, label: 'Mono', ref: { bankAccountId: acc.id } }] })],
      request: { customer: 'Acme', currency: 'USD', senderProfileId: wanted.id },
    });

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it('AC-13: an archived product is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const p = await createProduct(prisma, user.id, { currency: 'USD' });
    const { conversation, form } = await formFor(user.id, {
      questions: [q(0, 'PRODUCT', { lineIndex: 0, options: [{ optionId: 0, label: 'Audit', ref: { productId: p.id } }] })],
    });
    expect((await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).ok).toBe(true);
    await prisma.product.update({ where: { id: p.id }, data: { isActive: false } });

    expect(await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it('AC-13: an account deleted since the form was shown, with a typed price beside it, is still UNAVAILABLE (not INVALID)', async () => {
    const { user, actor } = await freelancer();
    const sp = await createSenderProfile(prisma, user.id);
    const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
    const { conversation, form } = await formFor(user.id, {
      questions: [
        q(0, 'BANK_ACCOUNT', { options: [{ optionId: 0, label: 'Mono', ref: { bankAccountId: acc.id } }] }),
        q(1, 'PRICE', { lineIndex: 0, input: 'AMOUNT' }),
      ],
      request: { customer: 'Acme', currency: 'USD', senderProfileId: sp.id },
    });
    await prisma.bankAccount.delete({ where: { id: acc.id } });

    expect(
      await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }, { questionId: 1, text: 'forty' }])
    ).toStrictEqual(UNAVAILABLE);
  });

  // ---- INVALID: per-question messages ------------------------------------------------------------------------------

  describe('format errors of typed answers', () => {
    const form3 = (userId: string) =>
      formFor(userId, {
        questions: [
          q(0, 'PRICE', { lineIndex: 0, input: 'AMOUNT' }),
          q(1, 'ISSUE_DATE', { input: 'DATE', options: [{ optionId: 0, label: 'Today', ref: { date: '2026-10-13' } }] }),
          q(2, 'DUE_DATE', { input: 'DATE' }),
          q(3, 'PO_NUMBER', { required: false, skippable: true }),
        ],
      });

    it('AC-12b: a typed "forty" price is INVALID with the amount message under form.answers.0', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await form3(user.id);

      const r = await check(actor, conversation.id, form.id, [
        { questionId: 0, text: 'forty' },
        { questionId: 1, optionId: 0 },
        { questionId: 2, text: '2026-11-01' },
      ]);

      expect(r).toEqual({ ok: false, kind: 'INVALID', fieldErrors: { 'form.answers.0': [ANSWER_MESSAGES.amount] } });
      expect(ANSWER_MESSAGES.amount).toBe('Enter a number greater than 0, with at most 2 decimals.');
    });

    it('AC-12b: "2026-02-30" is INVALID with "Pick a real day."', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await form3(user.id);

      const r = await check(actor, conversation.id, form.id, [
        { questionId: 0, text: '45' },
        { questionId: 1, text: '2026-02-30' },
        { questionId: 2, text: '2026-11-01' },
      ]);

      expect(r).toEqual({ ok: false, kind: 'INVALID', fieldErrors: { 'form.answers.1': ['Pick a real day.'] } });
    });

    it('AC-12b: a due date typed before a typed issue date is INVALID on the due question', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await form3(user.id);

      const r = await check(actor, conversation.id, form.id, [
        { questionId: 0, text: '45' },
        { questionId: 1, text: '2026-10-20' },
        { questionId: 2, text: '2026-10-01' },
      ]);

      expect(r).toEqual({
        ok: false,
        kind: 'INVALID',
        fieldErrors: { 'form.answers.2': ["The due date can't be before the issue date."] },
      });
    });

    it('AC-12b: a due date typed before a PICKED issue-date option (its stored day) is INVALID on the due question', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await form3(user.id);

      const r = await check(actor, conversation.id, form.id, [
        { questionId: 0, text: '45' },
        { questionId: 1, optionId: 0 },
        { questionId: 2, text: '2026-10-01' },
      ]);

      expect(r).toEqual({
        ok: false,
        kind: 'INVALID',
        fieldErrors: { 'form.answers.2': ["The due date can't be before the issue date."] },
      });
    });

    it('AC-12b: a text longer than the field allows is INVALID with the length message', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await form3(user.id);

      const r = await check(actor, conversation.id, form.id, [
        { questionId: 0, text: '45' },
        { questionId: 1, optionId: 0 },
        { questionId: 2, text: '2026-11-01' },
        { questionId: 3, text: 'x'.repeat(101) },
      ]);

      expect(r).toEqual({ ok: false, kind: 'INVALID', fieldErrors: { 'form.answers.3': ['Keep it under 100 characters.'] } });
    });

    it('AC-12b: several bad answers are all reported, each under its own question', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await form3(user.id);

      const r = await check(actor, conversation.id, form.id, [
        { questionId: 0, text: '0' },
        { questionId: 1, text: 'tomorrow' },
        { questionId: 2, text: '2026-11-01' },
      ]);

      expect(r).toEqual({
        ok: false,
        kind: 'INVALID',
        fieldErrors: { 'form.answers.0': [ANSWER_MESSAGES.amount], 'form.answers.1': [ANSWER_MESSAGES.day] },
      });
    });

    it('AC-12b: INVALID only after the structural check: a bad price beside an unknown question id is UNAVAILABLE', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await form3(user.id);

      const r = await check(actor, conversation.id, form.id, [
        { questionId: 0, text: 'forty' },
        { questionId: 1, optionId: 0 },
        { questionId: 2, text: '2026-11-01' },
        { questionId: 9, text: 'x' },
      ]);

      expect(r).toStrictEqual(UNAVAILABLE);
    });

    it('AC-12b: a bad price on a CLOSED form is UNAVAILABLE, not INVALID', async () => {
      const { user, actor } = await freelancer();
      const { conversation, form } = await customerPriceForm(user.id, { state: 'CLOSED' });

      expect(
        await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }, { questionId: 1, text: 'forty' }])
      ).toStrictEqual(UNAVAILABLE);
    });
  });

  // ---- no writes ----------------------------------------------------------------------------------------------------

  it('AC-12b: checkForm changes no row, ok, invalid or unavailable', async () => {
    const { user, actor } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id);
    await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(new Date()), used: 4, timeZone: TZ });
    const snap = async () => ({
      forms: await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } }),
      days: await prisma.messageAllowanceDay.findMany({ orderBy: { day: 'asc' } }),
      messages: await prisma.conversationMessage.count(),
    });
    const before = await snap();

    await check(actor, conversation.id, form.id, valid);
    await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 0 }, { questionId: 1, text: 'forty' }]);
    await check(actor, conversation.id, form.id, [{ questionId: 0, optionId: 8 }]);
    await check(actor, conversation.id, 'form_missing', valid);

    expect(await snap()).toEqual(before);
  });

  // ---- legacy rows (spec F9a) ----------------------------------------------------------------------------------------

  it('F9a: a legacy OPEN offer (kind CUSTOMER, backfilled question) is answerable as a one-question form', async () => {
    const { user, actor } = await freelancer();
    const c = await createCustomer(prisma, user.id);
    const { conversation, offer } = await legacyFor(user.id, { refs: [{ customerId: c.id }, { customerId: 'gone' }] });

    const r = await check(actor, conversation.id, offer.id, [{ questionId: 0, optionId: 0 }]);

    expect(r).toMatchObject({ ok: true, form: { id: offer.id }, answers: [{ questionId: 0, optionId: 0 }] });
  });

  it('F9a: a legacy offer whose picked record is gone is UNAVAILABLE; its typed answer is UNAVAILABLE too (input NONE)', async () => {
    const { user, actor } = await freelancer();
    const c = await createCustomer(prisma, user.id);
    const { conversation, offer } = await legacyFor(user.id, { refs: [{ customerId: c.id }] });

    expect(await check(actor, conversation.id, offer.id, [{ questionId: 0, text: 'Other' }])).toStrictEqual(UNAVAILABLE);
    await prisma.customer.delete({ where: { id: c.id } });
    expect(await check(actor, conversation.id, offer.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it('F9a: a legacy BANK_ACCOUNT offer whose account changed currency is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const sp = await createSenderProfile(prisma, user.id);
    const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
    const { conversation, offer } = await legacyFor(user.id, {
      kind: 'BANK_ACCOUNT',
      refs: [{ bankAccountId: acc.id }],
      request: { customer: 'Acme', currency: 'USD', senderProfileId: sp.id },
    });
    expect((await check(actor, conversation.id, offer.id, [{ questionId: 0, optionId: 0 }])).ok).toBe(true);
    await prisma.bankAccount.update({ where: { id: acc.id }, data: { currency: 'EUR' } });

    expect(await check(actor, conversation.id, offer.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it('F9a: a legacy CHOSEN offer is UNAVAILABLE', async () => {
    const { user, actor } = await freelancer();
    const c = await createCustomer(prisma, user.id);
    const { conversation, offer } = await legacyFor(user.id, {
      refs: [{ customerId: c.id }],
      state: 'CHOSEN',
      chosenOptionId: 0,
    });

    expect(await check(actor, conversation.id, offer.id, [{ questionId: 0, optionId: 0 }])).toStrictEqual(UNAVAILABLE);
  });

  it('F9a: a legacy offer is claimed OPEN to CHOSEN with the answers stored', async () => {
    const { user, actor } = await freelancer();
    const { offer } = await legacyFor(user.id, { refs: [{ customerId: 'x' }] });

    const claimed = await prisma.$transaction((tx) => svc.claimForm(tx, actor, offer.id, [{ questionId: 0, optionId: 0 }]));

    expect(claimed).toBe(true);
    expect(await row(offer.id)).toMatchObject({ state: 'CHOSEN', answers: [{ questionId: 0, optionId: 0 }] });
  });

  // ---- claim / release ------------------------------------------------------------------------------------------------

  it('AC-11: claimForm moves OPEN to CHOSEN with the answers once; a second claim is false and keeps the first answers', async () => {
    const { user, actor } = await freelancer();
    const { form } = await customerPriceForm(user.id);
    const other: Answer[] = [{ questionId: 0, optionId: 0 }, { questionId: 1, text: '99' }];

    const first = await prisma.$transaction((tx) => svc.claimForm(tx, actor, form.id, valid));
    const second = await prisma.$transaction((tx) => svc.claimForm(tx, actor, form.id, other));

    expect([first, second]).toEqual([true, false]);
    expect(await row(form.id)).toMatchObject({ state: 'CHOSEN', answers: valid });
  });

  it("AC-12b: claimForm is false for another Freelancer's form and changes nothing", async () => {
    const { actor } = await freelancer('t56-a@example.com');
    const other = await createFreelancer(prisma, { email: 't56-b@example.com', timeZone: TZ });
    const { form } = await customerPriceForm(other.id);

    const claimed = await prisma.$transaction((tx) => svc.claimForm(tx, actor, form.id, valid));

    expect(claimed).toBe(false);
    expect(await row(form.id)).toMatchObject({ state: 'OPEN', answers: null });
  });

  it('AC-11: claimForm is false for a CLOSED form', async () => {
    const { user, actor } = await freelancer();
    const { form } = await customerPriceForm(user.id, { state: 'CLOSED' });

    expect(await prisma.$transaction((tx) => svc.claimForm(tx, actor, form.id, valid))).toBe(false);
    expect(await row(form.id)).toMatchObject({ state: 'CLOSED', answers: null });
  });

  it('AC-11: releaseForm moves CHOSEN back to OPEN with no answers', async () => {
    const { user } = await freelancer();
    const { form } = await customerPriceForm(user.id);
    await prisma.choiceOffer.update({ where: { id: form.id }, data: { state: 'CHOSEN', answers: valid as never } });

    await prisma.$transaction((tx) => svc.releaseForm(tx, form.id));

    expect(await row(form.id)).toMatchObject({ state: 'OPEN', answers: null });
  });

  it('AC-11: releaseForm on an OPEN or CLOSED form is a no-op', async () => {
    const { user } = await freelancer();
    const open = await customerPriceForm(user.id);
    const closed = await formFor(user.id, { questions: [q(0, 'PRICE', { input: 'AMOUNT' })], state: 'CLOSED' });

    await prisma.$transaction(async (tx) => {
      await svc.releaseForm(tx, open.form.id);
      await svc.releaseForm(tx, closed.form.id);
    });

    expect(await row(open.form.id)).toMatchObject({ state: 'OPEN', answers: null });
    expect(await row(closed.form.id)).toMatchObject({ state: 'CLOSED', answers: null });
  });

  it('AC-12: releaseForm after a newer message was saved closes the form and clears its answers', async () => {
    const { user } = await freelancer();
    const { conversation, form } = await customerPriceForm(user.id);
    await prisma.choiceOffer.update({ where: { id: form.id }, data: { state: 'CHOSEN', answers: valid as never } });
    await prisma.conversationMessage.create({
      data: { conversationId: conversation.id, position: 50, role: 'USER', origin: 'TYPED', parts: [] },
    });

    await prisma.$transaction((tx) => svc.releaseForm(tx, form.id));

    expect(await row(form.id)).toMatchObject({ state: 'CLOSED', answers: null });
  });

  // ---- reserve and claim ------------------------------------------------------------------------------------------------

  it('AC-11: with one message left the Send takes the slot and claims the form; the next reply\'s form is turned down', async () => {
    const { user, actor } = await freelancer();
    const now = new Date();
    await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 29, timeZone: TZ });
    const first = await customerPriceForm(user.id);

    const r1 = await svc.reserveAndClaimForm(actor, now, first.form.id, valid);

    expect(r1.ok).toBe(true);
    expect(r1.ok && r1.state.used).toBe(30);
    expect(await usedOf(user.id)).toBe(30);
    expect(await row(first.form.id)).toMatchObject({ state: 'CHOSEN', answers: valid });

    const second = await customerPriceForm(user.id);
    const r2 = await svc.reserveAndClaimForm(actor, now, second.form.id, valid);

    expect(r2).toMatchObject({ ok: false, usedUp: { kind: 'ALLOWANCE_USED_UP' } });
    expect(await row(second.form.id)).toMatchObject({ state: 'OPEN', answers: null });
    expect(await usedOf(user.id)).toBe(30);
  });

  it('AC-11: with the allowance used up nothing is claimed', async () => {
    const { user, actor } = await freelancer();
    const now = new Date();
    await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 30, timeZone: TZ });
    const { form } = await customerPriceForm(user.id);

    const r = await svc.reserveAndClaimForm(actor, now, form.id, valid);

    expect(r).toMatchObject({ ok: false, usedUp: { kind: 'ALLOWANCE_USED_UP' } });
    expect(await row(form.id)).toMatchObject({ state: 'OPEN', answers: null });
    expect(await usedOf(user.id)).toBe(30);
  });

  it('AC-11: a lost claim is claimLost and takes no slot', async () => {
    const { user, actor } = await freelancer();
    const now = new Date();
    await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 5, timeZone: TZ });
    const { form } = await customerPriceForm(user.id, { state: 'CLOSED' });

    const r = await svc.reserveAndClaimForm(actor, now, form.id, valid);

    expect(r).toEqual({ ok: false, claimLost: true });
    expect(await usedOf(user.id)).toBe(5);
    expect(await row(form.id)).toMatchObject({ state: 'CLOSED', answers: null });
  });

  it('AC-11: two simultaneous Sends of the same form: exactly one claim and one count', async () => {
    const { user, actor } = await freelancer();
    const now = new Date();
    await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 5, timeZone: TZ });
    const { form } = await customerPriceForm(user.id);
    const other: Answer[] = [{ questionId: 0, optionId: 0 }, { questionId: 1, text: '12' }];

    const results = await Promise.all([
      svc.reserveAndClaimForm(actor, now, form.id, valid),
      svc.reserveAndClaimForm(actor, now, form.id, other),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, claimLost: true }]);
    expect(await usedOf(user.id)).toBe(6);
    expect((await row(form.id)).state).toBe('CHOSEN');
  });

  it('AC-11: release() of a successful reserve-and-claim gives the slot back and reopens the form with no answers', async () => {
    const { user, actor } = await freelancer();
    const now = new Date();
    await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 7, timeZone: TZ });
    const { form } = await customerPriceForm(user.id);
    const r = await svc.reserveAndClaimForm(actor, now, form.id, valid);
    if (!r.ok || !('release' in r)) throw new Error('expected ok');
    expect(await usedOf(user.id)).toBe(8);

    const after = await r.release();

    expect(after.used).toBe(7);
    expect(await usedOf(user.id)).toBe(7);
    expect(await row(form.id)).toMatchObject({ state: 'OPEN', answers: null });
  });

  it('AC-11, AC-12: release() after a newer message was saved gives the slot back and closes the claimed form', async () => {
    const { user, actor } = await freelancer();
    const now = new Date();
    await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 7, timeZone: TZ });
    const { conversation, form } = await customerPriceForm(user.id);
    const r = await svc.reserveAndClaimForm(actor, now, form.id, valid);
    if (!r.ok || !('release' in r)) throw new Error('expected ok');
    const newerMessage = await prisma.conversationMessage.create({
      data: { conversationId: conversation.id, position: 99, role: 'ASSISTANT', parts: [] },
    });
    const newer = await createQuestionForm(prisma, {
      userId: user.id,
      conversationId: conversation.id,
      messageId: newerMessage.id,
      questions: [q(0, 'PRICE', { input: 'AMOUNT' })],
    });

    await r.release();

    expect(await usedOf(user.id)).toBe(7);
    expect(await row(form.id)).toMatchObject({ state: 'CLOSED', answers: null });
    expect(await row(newer.id)).toMatchObject({ state: 'OPEN' });
  });

  // ---- timing (test-plan NFR) ----------------------------------------------------------------------------------------

  it('NFR: checkForm p95 <= 300 ms over 200 checks with 2,000 Customers', async () => {
    const { user, actor } = await freelancer();
    const customers: Prisma.CustomerCreateManyInput[] = Array.from({ length: 2000 }, (_v, i) => ({
      userId: user.id,
      name: `Scale Client ${i}`,
      email: `scale-client-${i}@example.test`,
      defaultCurrency: 'USD',
    }));
    for (let i = 0; i < customers.length; i += 1000) await prisma.customer.createMany({ data: customers.slice(i, i + 1000) });
    expect(await prisma.customer.count({ where: { userId: user.id } })).toBe(2000);
    const { conversation, form } = await customerPriceForm(user.id);
    expect((await check(actor, conversation.id, form.id, valid)).ok).toBe(true); // warm-up

    const times: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const start = performance.now();
      const r = await check(actor, conversation.id, form.id, valid);
      times.push(performance.now() - start);
      expect(r.ok).toBe(true);
    }

    expect(p95(times)).toBeLessThanOrEqual(300);
  }, 120_000);
});
