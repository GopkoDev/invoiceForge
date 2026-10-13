// ai-chat-v2 revision 2026-10-13 T51 (ADR-0011; data-model.md "ChoiceOffer — holds a Question form"; openapi 0.3.0
// StoredFormQuestion, FormOptionRef, FormView): the Question form's stored shape and its browser view. A question's
// options are records the server checked, supported currencies or computed dates, labelled by the server; the model
// writes only the plain `prompt`. Bounds and shape are zod's, not the database's (repo convention).
import 'server-only';
import { z } from 'zod';
import { isCalendarDay } from '@/lib/helpers/calendar-day';
import { offerOptionRefSchema, offerRowToFormView } from '@/lib/services/assistant-drafts/offers';
import { FORM_MAX_OPTIONS, FORM_MAX_QUESTIONS, formAnswersSchema } from '@/lib/validations/assistant-chat';
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
