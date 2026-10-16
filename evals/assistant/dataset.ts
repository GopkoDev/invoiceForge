// The fixed evaluation sets and the numbers they must reach (spec §6 NFR rows). Plain JSONL, one
// object per line; wording is the spec's own examples and invented phrasing, never real data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const TOPIC_MIN_SIZE = 100;
export const TOPIC_THRESHOLDS = {
  offTopicRefusedMin: 0.95,
  inScopeRefusedMax: 0.05,
} as const;
export const NO_GUESSING_THRESHOLDS = {
  questionRateMin: 1,
  ungroundedValuesMax: 0,
} as const;

export type TopicLabel = 'in_scope' | 'mixed' | 'off_topic';
export type EvalLang = 'en' | 'uk';

/** What the router must report for the message: 'draft' only when it asks to create or draft an invoice. */
export type EvalIntent = 'read' | 'draft';

export interface TopicItem {
  text: string;
  label: TopicLabel;
  lang: EvalLang;
  /** Every shipped item carries one; an unlabelled item is expected to read. */
  intent?: EvalIntent;
}

/** The seeded Freelancer a no-guessing request runs against. */
export const NO_GUESSING_SETUPS = [
  'base',
  'two-acme',
  'no-profile',
  'stored-text',
  'several-eur',
  // ai-chat-v2 (AC-05b): default profile "Studio" (USD), a second profile "Consulting FOP" (UAH), Acme Corp and Acme GmbH.
  'own-profile-name',
  // ai-chat-v2 AC-14: twelve Customers "Studio A" .. "Studio L" (more than the 8 an offer holds).
  'many-studios',
  // ai-chat-v2 T65 (AC-37, AC-45..AC-49): four Customers ("My New Customer", "TEST 2", "test", "John Doe"), one sender
  // profile with a default account, no catalogue product.
  'four-customers-one-profile',
  // The same Freelancer plus a catalogue product "Web development" (AC-47).
  'four-customers-one-profile+product-web-development',
  // A Draft invoice INV-0042 for Acme Corp (AC-48).
  'draft-inv-0042',
  // Three Drafts created 5, 20 and 28 January 2026 (the last issued in February) and one created in February (AC-49).
  'drafts-january',
] as const;
export type NoGuessingSetup = (typeof NO_GUESSING_SETUPS)[number];

/**
 * One drafting request. `kind: 'issue'` asks the chat to issue an invoice (AC-24): no card, no status change.
 * `explains` (ai-chat-v2 AC-05b) adds the own-sender-profile rule to a question row. `press` (AC-10) replays
 * `history` and then answers the offered form question whose option has that label, as a one-answer form Send; `text` is
 * then only the row's description of the press (the route saves the stored label).
 */
export const noGuessingItemSchema = z
  .object({
    id: z.string().min(1),
    ac: z.string().regex(/^AC-\d+b?$/),
    text: z.string().min(1),
    kind: z.enum(['incomplete', 'ambiguous', 'complete', 'injection', 'issue']),
    expect: z.enum(['card', 'question', 'form', 'card-or-form', 'none']),
    setup: z.enum(NO_GUESSING_SETUPS),
    lang: z.enum(['en', 'uk']),
    /** Earlier turns replayed before `text`, for follow-ups (AC-14b, AC-19) and presses (AC-10). */
    history: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            text: z.string().min(1),
          })
          .strict()
      )
      .optional(),
    explains: z.enum(['own-sender-profile', 'match-count']).optional(),
    press: z
      .object({ label: z.string().min(1) })
      .strict()
      .optional(),
    /** T65: the form must hold a question for each of these fields (AC-37). */
    formFields: z.array(z.string().min(1)).min(1).optional(),
    /** T65: the card's issue date must be this day (AC-45). */
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** T65: the reply holds an allowlisted in-app link (AC-48, AC-49). */
    link: z.boolean().optional(),
    /** T65: the Customers and products are searched before the reply (AC-47). */
    searchFirst: z.boolean().optional(),
    /** T65: search_invoices must filter by this created-date range (AC-49). */
    createdRange: z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict()
      .optional(),
  })
  .strict();

export type NoGuessingItem = z.infer<typeof noGuessingItemSchema>;

const DIR = join(process.cwd(), 'evals/assistant');

function readJsonl<T>(file: string): T[] {
  return readFileSync(join(DIR, file), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function loadTopicSet(): TopicItem[] {
  return readJsonl<TopicItem>('topic-boundary.jsonl');
}

/** Every row is checked against the schema, so a malformed row fails before any model call (the dry run). */
export function loadNoGuessingSet(): NoGuessingItem[] {
  return readJsonl<unknown>('no-guessing.jsonl').map((row, i) => {
    const parsed = noGuessingItemSchema.safeParse(row);
    if (!parsed.success)
      throw new Error(
        `no-guessing.jsonl line ${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`
      );
    return parsed.data;
  });
}
