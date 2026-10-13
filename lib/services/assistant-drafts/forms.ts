// ai-chat-v2 revision 2026-10-13 T51 (ADR-0011; data-model.md "ChoiceOffer — holds a Question form"; openapi 0.3.0
// StoredFormQuestion, FormOptionRef, FormView): the Question form's stored shape and its browser view. A question's
// options are records the server checked, supported currencies or computed dates, labelled by the server; the model
// writes only the plain `prompt`. Bounds and shape are zod's, not the database's (repo convention).
import 'server-only';
import { z } from 'zod';
import { startSpan } from '@sentry/nextjs';
import { Prisma, type PrismaClient } from '@prisma/client';
import { redactError } from '@/lib/helpers/prisma-error-scrub';
import { reserveMessageSlot, type ReserveResult } from '@/lib/services/assistant-usage/allowance';
import { formFormatErrors } from '@/lib/validations/form-answers';
import { addDaysToDay, isCalendarDay } from '@/lib/helpers/calendar-day';
import { accountLastFour } from '@/lib/helpers/account-last-four';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import type { DraftRequestPartial } from '@/lib/services/assistant-drafts/form-pin';
import {
  accountOptions,
  customerOptions,
  db,
  isCurrency,
  offerOptionRefSchema,
  offerRowToFormView,
  productOptions,
  profileOptions,
  storedOfferOptionsSchema,
  stillFits,
  type Currency,
} from '@/lib/services/assistant-drafts/offers';
import { formHeading, LINE_FIELDS } from '@/lib/services/assistant-drafts/form-headings';
import { draftRequestShape, type DraftIssue, type DraftRequest } from '@/lib/services/assistant-drafts/schema';
import { FORM_MAX_OPTIONS, FORM_MAX_QUESTIONS, formAnswersSchema, type FormAnswer } from '@/lib/validations/assistant-chat';
import type { ChoiceOfferKind, ChoiceOfferState, FormField, FormInput, FormView } from '@/types/assistant/types';

export const FORM_FIELDS = [
  'CUSTOMER',
  'SENDER_PROFILE',
  'BANK_ACCOUNT',
  'PRODUCT',
  'CURRENCY',
  'ISSUE_DATE',
  'DUE_DATE',
  'QUANTITY',
  'PRICE',
  'TAX_RATE',
  'DISCOUNT',
  'PO_NUMBER',
  'PAYMENT_TERMS',
  'NOTES',
  'FREE',
] as const satisfies readonly FormField[];
export const FORM_INPUTS = ['NONE', 'TEXT', 'AMOUNT', 'RATE', 'DISCOUNT', 'DATE'] as const satisfies readonly FormInput[];

/** What an option stands for: a record id or currency (the offer refs), an absolute day, or days after the issue date. */
export const formOptionRefSchema = z.union([
  offerOptionRefSchema,
  z.object({ date: z.string().refine(isCalendarDay, 'Not a calendar day.') }).strict(),
  z.object({ daysAfterIssue: z.union([z.literal(7), z.literal(14), z.literal(30)]) }).strict(),
]);
export type FormOptionRef = z.infer<typeof formOptionRefSchema>;

export const formOptionSchema = z
  .object({
    optionId: z.number().int().min(0).max(FORM_MAX_OPTIONS - 1),
    label: z.string().min(1).max(600),
    ref: formOptionRefSchema,
  })
  .strict();
export type FormOption = z.infer<typeof formOptionSchema>;

export const formQuestionSchema = z
  .object({
    questionId: z.number().int().min(0).max(FORM_MAX_QUESTIONS - 1),
    field: z.enum(FORM_FIELDS),
    lineIndex: z.number().int().min(0).max(49).nullable(),
    heading: z.string().min(1).max(60),
    prompt: z.string().max(140).nullable(),
    options: z.array(formOptionSchema).max(FORM_MAX_OPTIONS),
    input: z.enum(FORM_INPUTS),
    required: z.boolean(),
    skippable: z.boolean(),
    matchCount: z.number().int().min(FORM_MAX_OPTIONS + 1).nullable(),
    source: z.enum(['RESOLVER', 'CHAT', 'FALLBACK']),
  })
  .strict();
export type StoredFormQuestion = z.infer<typeof formQuestionSchema>;

export const storedFormQuestionsSchema = z.array(formQuestionSchema).min(1).max(FORM_MAX_QUESTIONS);

export { formAnswersSchema };

/** The columns a form view is read from (kind FORM, or a legacy offer row). */
export type FormRow = {
  id: string;
  kind: ChoiceOfferKind;
  state: ChoiceOfferState;
  lineIndex: number | null;
  options: unknown;
  chosenOptionId: number | null;
  questions: unknown;
  answers: unknown;
};

/** The browser's view of a stored form: labels only (no ref, no source, no request); answers once sent. */
export function toFormView(row: FormRow): FormView {
  if (row.kind !== 'FORM') return offerRowToFormView(row);
  const questions = storedFormQuestionsSchema.parse(row.questions);
  return {
    formId: row.id,
    state: row.state,
    questions: questions.map((q) => ({
      questionId: q.questionId,
      field: q.field,
      lineIndex: q.lineIndex,
      heading: q.heading,
      prompt: q.prompt,
      options: q.options.map(({ optionId, label }) => ({ optionId, label })),
      input: q.input,
      required: q.required,
      skippable: q.skippable,
      matchCount: q.matchCount,
    })),
    answers: row.state === 'CHOSEN' && row.answers !== null ? formAnswersSchema.parse(row.answers) : null,
  };
}

// ---------- T52: questions from resolver issues, date options, one form per reply (ADR-0011; spec §1 F1–F4) ----------

/** A question before it is placed in a form: no position and no heading yet (composeForm assigns both). */
export type FormQuestionDraft = Omit<StoredFormQuestion, 'questionId' | 'heading'>;
type DraftOption = Omit<FormOption, 'optionId'>;

/** The draft fields that may be left empty: a Skip answer leaves the value unset (spec §1 F4). */
export const OPTIONAL_FIELDS: ReadonlySet<FormField> = new Set<FormField>(['TAX_RATE', 'DISCOUNT', 'PO_NUMBER', 'PAYMENT_TERMS', 'NOTES']);

/** The typed input a field offers ("Other…" for records, currencies and dates; the only input for values). */
export function inputOf(field: FormField): FormInput {
  switch (field) {
    case 'ISSUE_DATE':
    case 'DUE_DATE':
      return 'DATE';
    case 'QUANTITY':
    case 'PRICE':
      return 'AMOUNT';
    case 'TAX_RATE':
      return 'RATE';
    case 'DISCOUNT':
      return 'DISCOUNT';
    default:
      return 'TEXT';
  }
}

const numbered = (options: DraftOption[]): FormOption[] => options.map((o, optionId) => ({ optionId, ...o }));

/** A question of `field`; above 8 candidates it offers none and states the count instead (AC-14). */
function question(
  field: FormField,
  lineIndex: number | null,
  options: DraftOption[],
  over: { total?: number; prompt?: string | null; optional?: boolean; source?: FormQuestionDraft['source'] } = {}
): FormQuestionDraft {
  const count = over.total ?? options.length;
  const tooMany = count > FORM_MAX_OPTIONS;
  const optional = over.optional ?? OPTIONAL_FIELDS.has(field);
  return {
    field,
    lineIndex: LINE_FIELDS.has(field) ? lineIndex : null,
    prompt: over.prompt ?? null,
    options: tooMany ? [] : numbered(options),
    input: inputOf(field),
    required: !optional,
    skippable: optional,
    matchCount: tooMany ? count : null,
    source: over.source ?? 'RESOLVER',
  };
}

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayLabel = (day: string) => DAY_LABEL.format(new Date(`${day}T00:00:00Z`));
const DUE_OFFSETS = [7, 14, 30] as const;

/**
 * The options a date question offers, computed by the server when the form is made (spec §1 F3, AC-39). The issue
 * date offers Today and Yesterday as absolute days of the Freelancer's `today` (already in their time zone), so a
 * form sent on a later day applies the day it showed. The due date offers 7 / 14 / 30 days after the issue date the
 * draft ends up with; its label shows the resulting day only when the issue date is already fixed (`issueDate`).
 */
export function dateOptions(
  field: 'ISSUE_DATE' | 'DUE_DATE',
  ctx: { today: string; issueDate?: string | null }
): FormOption[] {
  if (field === 'ISSUE_DATE') {
    const yesterday = addDaysToDay(ctx.today, -1);
    return numbered([
      { label: `Today · ${dayLabel(ctx.today)}`, ref: { date: ctx.today } },
      { label: `Yesterday · ${dayLabel(yesterday)}`, ref: { date: yesterday } },
    ]);
  }
  return numbered(
    DUE_OFFSETS.map((days) => ({
      label: `${days} days after the issue date${ctx.issueDate ? ` · ${dayLabel(addDaysToDay(ctx.issueDate, days))}` : ''}`,
      ref: { daysAfterIssue: days },
    }))
  );
}

/** The editor field a FIELD_INVALID issue names, as a form field and line; null for one no form asks (shipping, terms). */
function fieldOfPath(path: string): { field: FormField; lineIndex: number | null } | null {
  const line = /^lines\.(\d+)\.(quantity|price)$/.exec(path);
  if (line) return { field: line[2] === 'quantity' ? 'QUANTITY' : 'PRICE', lineIndex: Number(line[1]) };
  const top: Record<string, FormField> = {
    taxRate: 'TAX_RATE',
    discount: 'DISCOUNT',
    issueDate: 'ISSUE_DATE',
    dueDate: 'DUE_DATE',
    poNumber: 'PO_NUMBER',
    paymentTerms: 'PAYMENT_TERMS',
    notes: 'NOTES',
  };
  return path in top ? { field: top[path], lineIndex: null } : null;
}

/** The question one resolver issue asks; null for a kind no form can answer (no sender profile with an account). */
function questionOf(issue: DraftIssue, ctx: { today: string; issueDate?: string | null }): FormQuestionDraft | null {
  switch (issue.kind) {
    case 'CUSTOMER_AMBIGUOUS':
    case 'CUSTOMER_NEAR_MISS':
      return question('CUSTOMER', null, customerOptions(issue.candidates));
    case 'CUSTOMER_NOT_FOUND':
      return question('CUSTOMER', null, []);
    case 'SENDER_PROFILE_NOT_FOUND':
      return question('SENDER_PROFILE', null, profileOptions(issue.profiles));
    case 'DEFAULT_PROFILE_WITHOUT_ACCOUNT':
      return issue.otherProfiles.length > 0 ? question('SENDER_PROFILE', null, profileOptions(issue.otherProfiles)) : null;
    case 'NO_ACCOUNT_IN_CURRENCY': {
      if (issue.otherProfiles.length > 0) return question('SENDER_PROFILE', null, profileOptions(issue.otherProfiles));
      // No profile has an account in the asked currency: ask for a currency this profile does have.
      const codes = [...new Set(issue.accounts.map((a) => a.currency))].filter(isCurrency);
      return codes.length > 0 ? question('CURRENCY', null, codes.map((code) => ({ label: code, ref: { currency: code } }))) : null;
    }
    case 'CURRENCY_UNCLEAR':
      return question(
        'CURRENCY',
        null,
        issue.options.filter(isCurrency).map((code) => ({ label: code, ref: { currency: code } }))
      );
    case 'SEVERAL_ACCOUNTS_IN_CURRENCY':
    case 'BANK_ACCOUNT_NOT_FOUND':
    case 'BANK_ACCOUNT_AMBIGUOUS':
      return question('BANK_ACCOUNT', null, accountOptions(issue.accounts));
    case 'BANK_ACCOUNT_CURRENCY_MISMATCH':
      return question('BANK_ACCOUNT', null, accountOptions(issue.accounts ?? []));
    case 'PRODUCT_AMBIGUOUS':
      return question('PRODUCT', issue.lineIndex, productOptions(issue.candidates), { total: issue.total });
    case 'PRODUCT_NOT_FOUND':
      return question('PRODUCT', issue.lineIndex, []);
    case 'LINE_AMOUNT_MISSING':
    case 'LINE_PRICE_MISSING_IN_CURRENCY':
      return question('PRICE', issue.lineIndex, []);
    case 'LINE_QUANTITY_MISSING':
      return question('QUANTITY', issue.lineIndex, []);
    case 'FIELD_INVALID': {
      const target = fieldOfPath(issue.field);
      if (!target) return null;
      const options =
        target.field === 'ISSUE_DATE' || target.field === 'DUE_DATE' ? dateOptions(target.field, ctx) : [];
      return question(target.field, target.lineIndex, options, { prompt: issue.message.slice(0, 140) });
    }
    case 'NO_SENDER_PROFILE_WITH_ACCOUNT':
      return null;
  }
}

/**
 * Every resolver issue becomes a question (ADR-0011 "Sources of questions"): record choices with the server's labels
 * (spec §1 "What a button shows"), values to type as input-only questions, more than 8 matches as input-only with the
 * count (AC-14). Pure: the same issues always give the same questions, and no model text reaches an option (AC-09).
 */
export function formFromIssues(
  issues: readonly DraftIssue[],
  ctx: { invoiceCurrency?: Currency | null; today: string; timeZone: string; issueDate?: string | null }
): FormQuestionDraft[] {
  return issues.map((issue) => questionOf(issue, ctx)).filter((q): q is FormQuestionDraft => q !== null);
}

/** The questions a refused ask_user call wanted, as inputs only (spec §1 F3: never prose, never unchecked options). */
export function fallbackQuestions(
  asked: ReadonlyArray<{ field: FormField; lineIndex?: number | null; prompt?: string | null; optional?: boolean }>
): FormQuestionDraft[] {
  return asked.map((a) =>
    question(a.field, a.lineIndex ?? null, [], {
      prompt: a.prompt?.slice(0, 140) ?? null,
      optional: a.field === 'FREE' ? (a.optional ?? false) : OPTIONAL_FIELDS.has(a.field),
      source: 'FALLBACK',
    })
  );
}

/** Spec §1 F1 order: records, currency, products by line, dates, quantities and prices by line, other values, free. */
const RANK: Record<FormField, number> = {
  CUSTOMER: 0,
  SENDER_PROFILE: 1,
  BANK_ACCOUNT: 2,
  CURRENCY: 3,
  PRODUCT: 4,
  ISSUE_DATE: 5,
  DUE_DATE: 6,
  QUANTITY: 7,
  PRICE: 7,
  TAX_RATE: 8,
  DISCOUNT: 9,
  PO_NUMBER: 10,
  PAYMENT_TERMS: 11,
  NOTES: 12,
  FREE: 13,
};
const SUB_RANK: Partial<Record<FormField, number>> = { QUANTITY: 0, PRICE: 1 };

/**
 * One form per reply (ADR-0011): the resolver's questions, then the chat's questions for a field and line the resolver
 * did not ask (the resolver's own options win; a missing prompt is taken from the chat), sorted in the spec §1 F1 order
 * and capped at 6 (the rest are asked in the next form). Questions are numbered 0..n-1 and get the app heading.
 * `fallback` turns the chat's questions into inputs only (a turn that ended without a valid ask_user call).
 */
export function composeForm(
  resolver: readonly FormQuestionDraft[],
  chat: readonly FormQuestionDraft[],
  opts: { fallback?: boolean } = {}
): StoredFormQuestion[] {
  const key = (q: FormQuestionDraft) => `${q.field}#${q.lineIndex ?? ''}`;
  const merged: FormQuestionDraft[] = [];
  const byKey = new Map<string, FormQuestionDraft>();
  const chatQuestions = opts.fallback
    ? fallbackQuestions(chat.map((q) => ({ field: q.field, lineIndex: q.lineIndex, prompt: q.prompt, optional: !q.required })))
    : chat;
  for (const q of [...resolver, ...chatQuestions]) {
    if (q.field === 'FREE') {
      merged.push(q);
      continue;
    }
    const existing = byKey.get(key(q));
    if (existing) {
      if (existing.prompt === null && q.prompt !== null) existing.prompt = q.prompt;
      continue;
    }
    const copy = { ...q };
    byKey.set(key(q), copy);
    merged.push(copy);
  }
  const line = (q: FormQuestionDraft) => q.lineIndex ?? -1;
  const ordered = merged
    .map((q, i) => ({ q, i }))
    .sort(
      (a, b) =>
        RANK[a.q.field] - RANK[b.q.field] ||
        line(a.q) - line(b.q) ||
        (SUB_RANK[a.q.field] ?? 0) - (SUB_RANK[b.q.field] ?? 0) ||
        a.i - b.i
    )
    .slice(0, FORM_MAX_QUESTIONS);
  return ordered.map(({ q }, questionId) => ({ questionId, heading: formHeading(q.field, q.lineIndex), ...q }));
}


// ---------- T54: the chat-only ask_user tool's check (ADR-0011 "Sources of questions" (b); AC-09, AC-37) ----------

const RECORD_FIELDS: ReadonlySet<FormField> = new Set<FormField>(['CUSTOMER', 'SENDER_PROFILE', 'BANK_ACCOUNT', 'PRODUCT']);
const CURRENCY_CODES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'] as const;

export const askUserInputSchema = z
  .object({
    draft: z
      .object({ ...draftRequestShape, lines: draftRequestShape.lines.optional() })
      .strict()
      .optional()
      .describe('What the Freelancer already said, as a partial draft request. Every field is optional.'),
    questions: z
      .array(
        z
          .object({
            field: z.enum(FORM_FIELDS),
            lineIndex: z.number().int().min(0).max(49).optional(),
            prompt: z.string().min(1).max(140),
            recordIds: z.array(z.string().min(1).max(64)).max(FORM_MAX_OPTIONS).optional(),
            currencies: z.array(z.enum(CURRENCY_CODES)).max(5).optional(),
            optional: z.boolean().optional(),
          })
          .strict()
      )
      .min(1)
      .max(FORM_MAX_QUESTIONS),
  })
  .strict();
export type AskUserInput = z.infer<typeof askUserInputSchema>;

export type AskUserChecked =
  | { ok: true; questions: FormQuestionDraft[]; draft: DraftRequestPartial | null }
  | { ok: false; error: 'OPTIONS_UNAVAILABLE' };

const REFUSED: AskUserChecked = { ok: false, error: 'OPTIONS_UNAVAILABLE' };

/**
 * Checks one ask_user call: every record id is loaded owner-scoped and by the question's kind, and labelled by the
 * server; one failing id (missing, foreign, wrong kind, or ids on a value question) fails the whole call alike.
 */
export async function checkAskUser(actor: ActingFreelancer, raw: unknown, ctx: { today: string }): Promise<AskUserChecked> {
  const parsed = askUserInputSchema.safeParse(raw);
  if (!parsed.success) return REFUSED;
  const input = parsed.data;
  const { prisma } = await import('@/prisma');
  const userId = actor.userId;
  const draft = (input.draft ?? null) as DraftRequestPartial | null;

  if (draft) {
    if (draft.customerId !== undefined && (await prisma.customer.count({ where: { id: draft.customerId, userId } })) !== 1) return REFUSED;
    if (draft.senderProfileId !== undefined && (await prisma.senderProfile.count({ where: { id: draft.senderProfileId, userId } })) !== 1) return REFUSED;
    const productIds = [...new Set((draft.lines ?? []).flatMap((l) => (l.productId ? [l.productId] : [])))];
    if (productIds.length > 0 && (await prisma.product.count({ where: { id: { in: productIds }, userId } })) !== productIds.length) return REFUSED;
  }

  const questions: FormQuestionDraft[] = [];
  for (const q of input.questions) {
    let options: DraftOption[] = [];
    const ids = q.recordIds ?? [];
    if (ids.length > 0 && !RECORD_FIELDS.has(q.field)) return REFUSED;
    if (new Set(ids).size !== ids.length) return REFUSED;
    if (ids.length > 0) {
      const inOrder = <T extends { id: string }>(rows: T[]): T[] | null => {
        const byId = new Map(rows.map((r) => [r.id, r]));
        const ordered = ids.map((id) => byId.get(id));
        return ordered.every((r) => r !== undefined) ? (ordered as T[]) : null;
      };
      if (q.field === 'CUSTOMER') {
        const rows = inOrder(await prisma.customer.findMany({ where: { id: { in: ids }, userId } }));
        if (!rows) return REFUSED;
        options = customerOptions(rows.map((r) => ({ customerId: r.id, name: { freelancerText: r.name }, email: r.email })));
      } else if (q.field === 'SENDER_PROFILE') {
        const rows = inOrder(await prisma.senderProfile.findMany({ where: { id: { in: ids }, userId } }));
        if (!rows) return REFUSED;
        options = profileOptions(rows.map((r) => ({ senderProfileId: r.id, name: { freelancerText: r.name } })));
      } else if (q.field === 'BANK_ACCOUNT') {
        const rows = inOrder(await prisma.bankAccount.findMany({ where: { id: { in: ids }, senderProfile: { userId } } }));
        if (!rows) return REFUSED;
        options = accountOptions(
          rows.map((r) => ({
            bankAccountId: r.id,
            bankName: { freelancerText: r.bankName },
            lastFour: accountLastFour(r.accountNumber),
            currency: r.currency,
          }))
        );
      } else {
        const rows = inOrder(await prisma.product.findMany({ where: { id: { in: ids }, userId, isActive: true } }));
        if (!rows) return REFUSED;
        options = productOptions(
          rows.map((r) => ({
            productId: r.id,
            name: { freelancerText: r.name },
            unit: r.unit,
            price: Number(r.price).toFixed(2),
            currency: r.currency,
          }))
        );
      }
    } else if (q.field === 'CURRENCY' && q.currencies) {
      options = q.currencies.map((code) => ({ label: code, ref: { currency: code } }));
    } else if (q.field === 'ISSUE_DATE' || q.field === 'DUE_DATE') {
      options = dateOptions(q.field, { today: ctx.today, issueDate: draft?.issueDate ?? null }).map(({ label, ref }) => ({ label, ref }));
    }
    questions.push(
      question(q.field, q.lineIndex ?? null, options, {
        prompt: q.prompt,
        optional: q.field === 'FREE' ? (q.optional ?? false) : OPTIONAL_FIELDS.has(q.field),
        source: 'CHAT',
      })
    );
  }
  return { ok: true, questions, draft };
}

// ---------- T56: the form check, claim and release (ADR-0011 "Submit"; sad.md §5 "Form check"; AC-11, AC-12b, AC-13) ----------

type Tx = Prisma.TransactionClient | PrismaClient;

export type CheckedForm =
  | { ok: true; form: { id: string; request: DraftRequest | null; questions: StoredFormQuestion[] }; answers: FormAnswer[] }
  | { ok: false; kind: 'UNAVAILABLE' }
  | { ok: false; kind: 'INVALID'; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: 'FAILED' };

const FORM_UNAVAILABLE = { ok: false, kind: 'UNAVAILABLE' } as const;
const FORM_FAILED = { ok: false, kind: 'FAILED' } as const;

/**
 * A sent form is answered by question id and option id, never by record id (ADR-0003). Every structural cause of a
 * refusal answers the same UNAVAILABLE (AC-12b); typed answers are format-checked only after the structure and the
 * picked records passed (INVALID, per question); a system failure answers FAILED. Writes nothing; span
 * `chat.form-check` carries the outcome only.
 */
export function checkForm(
  actor: ActingFreelancer,
  input: { conversationId: string; form: { formId: string; answers: FormAnswer[] } }
): Promise<CheckedForm> {
  return startSpan({ name: 'chat.form-check', op: 'function' }, async (span) => {
    let result: CheckedForm = FORM_UNAVAILABLE;
    try {
      result = await checkFormRow(actor, input);
    } catch (error) {
      console.error('[checkForm] failed:', redactError(error));
      result = FORM_FAILED;
    }
    span?.setAttribute('outcome', result.ok ? 'ok' : result.kind.toLowerCase());
    return result;
  });
}

/** The stored questions of a row: a FORM row's own, or a legacy offer as its one backfilled question (F9a). */
function questionsOfRow(row: {
  kind: ChoiceOfferKind;
  lineIndex: number | null;
  questions: unknown;
  options: unknown;
}): StoredFormQuestion[] | null {
  if (row.kind === 'FORM') {
    const parsed = storedFormQuestionsSchema.safeParse(row.questions);
    return parsed.success ? parsed.data : null;
  }
  const options = storedOfferOptionsSchema.safeParse(row.options);
  if (!options.success) return null;
  const field: FormField = row.kind;
  return [
    {
      questionId: 0,
      field,
      lineIndex: row.lineIndex,
      heading: formHeading(field, row.lineIndex),
      prompt: null,
      options: options.data,
      input: 'NONE',
      required: true,
      skippable: false,
      matchCount: null,
      source: 'RESOLVER',
    },
  ];
}

async function checkFormRow(
  actor: ActingFreelancer,
  input: { conversationId: string; form: { formId: string; answers: FormAnswer[] } }
): Promise<CheckedForm> {
  const row = await (await db()).choiceOffer.findFirst({
    where: { id: input.form.formId, userId: actor.userId, state: 'OPEN' },
    select: { id: true, conversationId: true, kind: true, request: true, questions: true, options: true, lineIndex: true },
  });
  if (!row || row.conversationId !== input.conversationId) return FORM_UNAVAILABLE;
  const questions = questionsOfRow(row);
  if (!questions) return FORM_UNAVAILABLE;
  // Written by saveTurn from the resolver's own request (ADR-0003), never from the client.
  const request = (row.request ?? null) as DraftRequest | null;
  const { answers } = input.form;

  const byId = new Map(questions.map((q) => [q.questionId, q]));
  const answered = new Set<number>();
  const picked: FormOption[] = [];
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question || answered.has(answer.questionId)) return FORM_UNAVAILABLE;
    answered.add(answer.questionId);
    if ('optionId' in answer) {
      const option = question.options.find((o) => o.optionId === answer.optionId);
      if (!option) return FORM_UNAVAILABLE;
      picked.push(option);
    } else if ('text' in answer) {
      if (question.input === 'NONE') return FORM_UNAVAILABLE;
    } else if (!question.skippable) {
      return FORM_UNAVAILABLE;
    }
  }
  if (questions.some((q) => q.required && !answered.has(q.questionId))) return FORM_UNAVAILABLE;

  // Every picked record must still exist for the actor and still fit (AC-13), before any format message is given.
  for (const option of picked) {
    const ref = option.ref;
    if ('date' in ref || 'daysAfterIssue' in ref) continue;
    if (!(await stillFits(actor, ref, request))) return FORM_UNAVAILABLE;
  }

  const errors = formFormatErrors(questions, answers, {
    optionDate: (questionId, optionId) => {
      const ref = byId.get(questionId)?.options.find((o) => o.optionId === optionId)?.ref;
      return ref && 'date' in ref ? ref.date : null;
    },
  });
  const fieldErrors = Object.fromEntries(Object.entries(errors).map(([id, message]) => [`form.answers.${id}`, [message]]));
  if (Object.keys(fieldErrors).length > 0) return { ok: false, kind: 'INVALID', fieldErrors };
  return { ok: true, form: { id: row.id, request, questions }, answers };
}

/** OPEN -> CHOSEN with the answers; false when another Send claimed it first or it is not the actor's open form. */
export async function claimForm(tx: Tx, actor: ActingFreelancer, formId: string, answers: FormAnswer[]): Promise<boolean> {
  const { count } = await tx.choiceOffer.updateMany({
    where: { id: formId, userId: actor.userId, state: 'OPEN' },
    data: { state: 'CHOSEN', answers },
  });
  return count === 1;
}

/**
 * CHOSEN -> OPEN (answers cleared) after a Send that was not counted; a no-op for any other state. With a newer message
 * saved meanwhile the form ends CLOSED instead (same rule and lock as releaseOffer; review 2026-10-13 R1-B2, R2-B1).
 */
export async function releaseForm(tx: Tx, formId: string): Promise<void> {
  const claimed = await tx.choiceOffer.findFirst({
    where: { id: formId, state: 'CHOSEN' },
    select: { conversationId: true, message: { select: { position: true } } },
  });
  if (!claimed) return;
  await tx.$queryRaw`SELECT 1 FROM "Conversation" WHERE id = ${claimed.conversationId} FOR UPDATE`;
  const newer = await tx.conversationMessage.count({
    where: { conversationId: claimed.conversationId, position: { gt: claimed.message.position } },
  });
  await tx.choiceOffer.updateMany({
    where: { id: formId, state: 'CHOSEN' },
    data: { state: newer > 0 ? 'CLOSED' : 'OPEN', answers: Prisma.DbNull, chosenOptionId: null },
  });
}

/** A valid Send takes one slot of today's allowance and claims its form in one transaction (Critical flow 1, AC-11). */
export function reserveAndClaimForm(
  actor: ActingFreelancer,
  now: Date,
  formId: string,
  answers: FormAnswer[]
): Promise<ReserveResult> {
  return reserveMessageSlot(actor, now, {
    claim: (tx) => claimForm(tx, actor, formId, answers),
    release: (tx) => releaseForm(tx, formId),
  });
}
