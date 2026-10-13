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

// ai-chat-v2 (openapi ChatRequest, ChatChoice): a press refers to an option of a stored offer, never a record id.
export const chatChoiceSchema = z
  .object({ offerId: recordId, optionId: z.number().int().min(0).max(7) })
  .strict();
/** ai-chat-v2 T17 (contracts/server-actions.md §issueFromPreview): the invoice and the version the preview showed. */
export const issueFromPreviewInputSchema = z
  .object({ invoiceId: recordId, expectedVersion: z.number().int().min(0) })
  .strict();

export const conversationStartPointSchema = z.enum(['AI_SECTION', 'INVOICE_LIST', 'DASHBOARD_PROMPT', 'DASHBOARD_CREATE']);
/** The origins a client may ask for; PRESSED is set by the server from a valid choice only. */
export const requestMessageOriginSchema = z.enum(['TYPED', 'DASHBOARD']);

export const CHOICE_NEEDS_CONVERSATION = 'A choice can only be sent in a saved conversation.';
const CHOICE_WITH_ORIGIN = 'A choice is sent without an origin.';
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
    choice: chatChoiceSchema.optional(),
    origin: requestMessageOriginSchema.optional(),
    startedFrom: conversationStartPointSchema.optional(),
  })
  .strict()
  // Field combinations (openapi ChatRequest): each violation is keyed by its field.
  .superRefine((v, ctx) => {
    const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message });
    if (v.choice && v.conversationId === null) issue('choice', CHOICE_NEEDS_CONVERSATION);
    if (v.choice && v.origin !== undefined) issue('origin', CHOICE_WITH_ORIGIN);
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
