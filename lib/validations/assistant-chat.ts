// Chat-side zod schemas of the ai-assistant feature, mirroring
// docs/features/ai-assistant/contracts/openapi.yaml (ChatRequest, AppLink, AppPageKey, AllowanceState).
import { z } from 'zod';

const recordId = z.string().min(1).max(64);

export const appPageKeySchema = z.enum([
  'dashboard',
  'invoices',
  'new-invoice',
  'customers',
  'new-customer',
  'products',
  'new-product',
  'sender-profiles',
  'new-sender-profile',
  'sender-profile-bank-accounts',
  'settings-profile',
  'settings-privacy',
  'settings-assistants',
  'ai',
]);

export const appLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invoice'), invoiceId: recordId, label: z.string() }).strict(),
  z
    .object({
      kind: z.literal('page'),
      page: appPageKeySchema,
      senderProfileId: recordId.optional(),
    })
    .strict(),
]);

export const allowanceStateSchema = z
  .object({
    limit: z.literal(30),
    used: z.number().int().min(0).max(30),
    left: z.number().int().min(0).max(30),
    renewsAt: z.string().datetime(),
    timeZone: z.string().min(1),
  })
  .strict();

/** ai-chat-v2 T17 (contracts/server-actions.md §issueFromPreview): the invoice and the version the preview showed. */
export const issueFromPreviewInputSchema = z
  .object({ invoiceId: recordId, expectedVersion: z.number().int().min(0) })
  .strict();

export const conversationStartPointSchema = z.enum(['AI_SECTION', 'INVOICE_LIST', 'DASHBOARD_PROMPT', 'DASHBOARD_CREATE']);
/** The origins a client may ask for; FORM is set by the server from a valid form Send only. */
export const requestMessageOriginSchema = z.enum(['TYPED', 'DASHBOARD']);

// ai-chat-v2 revision 2026-10-13 (ADR-0011; openapi ChatForm, FormAnswer): a sent Question form. Answers name a question
// and an option by position, or carry the Freelancer's own typed text, or skip an optional question; never a record id
// or a label. Isomorphic: the browser builds the same shape.
export const FORM_MAX_QUESTIONS = 6;
export const FORM_MAX_OPTIONS = 8;
const questionId = z.number().int().min(0).max(FORM_MAX_QUESTIONS - 1);
export const formAnswerSchema = z.union([
  z.object({ questionId, optionId: z.number().int().min(0).max(FORM_MAX_OPTIONS - 1) }).strict(),
  z.object({ questionId, text: z.string().min(1).max(2000) }).strict(),
  z.object({ questionId, skipped: z.literal(true) }).strict(),
]);
export const formAnswersSchema = z
  .array(formAnswerSchema)
  .min(1)
  .max(FORM_MAX_QUESTIONS)
  .refine((answers) => new Set(answers.map((a) => a.questionId)).size === answers.length, 'At most one answer per question.');
export const chatFormSchema = z.object({ formId: recordId, answers: formAnswersSchema }).strict();
export type FormAnswer = z.infer<typeof formAnswerSchema>;
export type ChatForm = z.infer<typeof chatFormSchema>;

export const FORM_NEEDS_CONVERSATION = 'A form can only be sent in a saved conversation.';
const FORM_WITH_ORIGIN = 'A form is sent without an origin.';
const FIRST_MESSAGE_ONLY = "This can only be sent with a new conversation's first message.";
const DASHBOARD_TOGETHER = 'The dashboard prompt sends origin DASHBOARD with start point DASHBOARD_PROMPT.';

export const chatRequestSchema = z
  .object({
    conversationId: recordId.nullable(),
    message: z
      .object({
        id: z.string().min(1).max(64),
        role: z.literal('user'),
        parts: z
          .array(
            z
              .object({
                type: z.literal('text'),
                text: z.string().trim().min(1).max(2000),
              })
              .strict()
          )
          .length(1),
      })
      .strict(),
    form: chatFormSchema.optional(),
    origin: requestMessageOriginSchema.optional(),
    startedFrom: conversationStartPointSchema.optional(),
  })
  .strict()
  // Field combinations (openapi ChatRequest): each violation is keyed by its field.
  .superRefine((v, ctx) => {
    const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message });
    if (v.form && v.conversationId === null) issue('form', FORM_NEEDS_CONVERSATION);
    if (v.form && v.origin !== undefined) issue('origin', FORM_WITH_ORIGIN);
    if (v.conversationId !== null) {
      if (v.origin !== undefined) issue('origin', FIRST_MESSAGE_ONLY);
      if (v.startedFrom !== undefined) issue('startedFrom', FIRST_MESSAGE_ONLY);
    } else if ((v.origin === 'DASHBOARD') !== (v.startedFrom === 'DASHBOARD_PROMPT')) {
      issue(v.origin === 'DASHBOARD' ? 'startedFrom' : 'origin', DASHBOARD_TOGETHER);
    }
  });

export type AppPageKey = z.infer<typeof appPageKeySchema>;
export type AppLink = z.infer<typeof appLinkSchema>;
export type AllowanceState = z.infer<typeof allowanceStateSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
