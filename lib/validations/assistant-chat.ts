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
  })
  .strict();

export type AppPageKey = z.infer<typeof appPageKeySchema>;
export type AppLink = z.infer<typeof appLinkSchema>;
export type AllowanceState = z.infer<typeof allowanceStateSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
