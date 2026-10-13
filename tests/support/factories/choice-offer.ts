// ai-chat-v2 T02: a stored set of Offered choices tied to an ASSISTANT reply. Defaults: CUSTOMER, OPEN, two options
// "Acme Corp (billing@acme.example.test)" / "Acme GmbH (no email)". `request` and `options` are typed literals until
// T10 lands the production zod schemas; then they are built by those schemas so a fixture cannot drift.
// Fixture text only, never real data.

import { Prisma, type ChoiceOffer, type ChoiceOfferKind, type ChoiceOfferState, type PrismaClient } from '@prisma/client';

export interface FixtureOfferOption {
  optionId: number;
  label: string;
  ref: Record<string, string>;
}

export interface CreateChoiceOfferParams {
  userId: string;
  conversationId: string;
  /** The ASSISTANT reply that shows the buttons. */
  messageId: string;
  kind?: ChoiceOfferKind;
  lineIndex?: number | null;
  request?: Prisma.InputJsonValue;
  options?: FixtureOfferOption[];
  state?: ChoiceOfferState;
  chosenOptionId?: number | null;
  id?: string;
}

export const DEFAULT_OFFER_REQUEST = {
  customer: 'Acme',
  currency: 'USD',
  lines: [{ description: 'Design work', quantity: '20', price: '50' }],
} as const;

export function defaultOfferOptions(customerIds: [string, string] = ['fixture-acme-corp', 'fixture-acme-gmbh']): FixtureOfferOption[] {
  return [
    { optionId: 1, label: 'Acme Corp (billing@acme.example.test)', ref: { customerId: customerIds[0] } },
    { optionId: 2, label: 'Acme GmbH (no email)', ref: { customerId: customerIds[1] } },
  ];
}

// ---------- ai-chat-v2 T50 (ADR-0011): a Question form row (kind FORM) ----------
// Default: a Customer question (Acme Corp / Acme GmbH + "Other…") and a "Line 1 · Price" input question, over
// DEFAULT_OFFER_REQUEST. Typed literals until T51 lands formQuestionSchema; then they are parsed by it.

export interface FixtureFormQuestion {
  questionId: number;
  field: string;
  lineIndex: number | null;
  heading: string;
  prompt: string | null;
  options: Array<{ optionId: number; label: string; ref: Record<string, unknown> }>;
  input: string;
  required: boolean;
  skippable: boolean;
  matchCount: number | null;
  source: 'RESOLVER' | 'CHAT' | 'FALLBACK';
}

export interface CreateQuestionFormParams {
  userId: string;
  conversationId: string;
  /** The ASSISTANT reply that shows the form. */
  messageId: string;
  questions?: FixtureFormQuestion[];
  /** null: a free-question form. Default DEFAULT_OFFER_REQUEST. */
  request?: Prisma.InputJsonValue | null;
  state?: ChoiceOfferState;
  answers?: Prisma.InputJsonValue | null;
  id?: string;
}

export function defaultFormQuestions(customerIds: [string, string] = ['fixture-acme-corp', 'fixture-acme-gmbh']): FixtureFormQuestion[] {
  return [
    {
      questionId: 0,
      field: 'CUSTOMER',
      lineIndex: null,
      heading: 'Customer',
      prompt: 'Which Acme do you mean?',
      options: [
        { optionId: 0, label: 'Acme Corp', ref: { customerId: customerIds[0] } },
        { optionId: 1, label: 'Acme GmbH', ref: { customerId: customerIds[1] } },
      ],
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
      prompt: 'What is the hourly price?',
      options: [],
      input: 'AMOUNT',
      required: true,
      skippable: false,
      matchCount: null,
      source: 'CHAT',
    },
  ];
}

export async function createQuestionForm(prisma: PrismaClient, params: CreateQuestionFormParams): Promise<ChoiceOffer> {
  const questions = params.questions ?? defaultFormQuestions();
  return prisma.choiceOffer.create({
    data: {
      ...(params.id ? { id: params.id } : {}),
      userId: params.userId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      kind: 'FORM',
      lineIndex: null,
      request: params.request === null ? Prisma.DbNull : (params.request ?? DEFAULT_OFFER_REQUEST),
      options: [],
      questions: questions as unknown as Prisma.InputJsonValue,
      answers: params.answers === null || params.answers === undefined ? Prisma.DbNull : params.answers,
      state: params.state ?? 'OPEN',
      chosenOptionId: null,
    },
  });
}

export async function createChoiceOffer(prisma: PrismaClient, params: CreateChoiceOfferParams): Promise<ChoiceOffer> {
  return prisma.choiceOffer.create({
    data: {
      ...(params.id ? { id: params.id } : {}),
      userId: params.userId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      kind: params.kind ?? 'CUSTOMER',
      lineIndex: params.lineIndex ?? null,
      request: params.request ?? DEFAULT_OFFER_REQUEST,
      options: (params.options ?? defaultOfferOptions()) as unknown as Prisma.InputJsonValue,
      state: params.state ?? 'OPEN',
      chosenOptionId: params.chosenOptionId ?? null,
    },
  });
}
