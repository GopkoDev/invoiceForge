// ai-chat-v2 T68: seeds Question forms behind saved assistant replies for the e2e-through-UI specs. Written directly
// (not through tests/support/factories/choice-offer.ts): that factory imports app modules (zod schema ->
// @sentry/nextjs) which Playwright's loader cannot resolve, the same reason seed.ts avoids the invoice factory. The
// stored shape is the one lib/services/assistant-drafts/forms.ts parses (formQuestionSchema); the app re-parses it
// on every read, so a drifted fixture fails loudly in the chat.
import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  CreateQuestionFormParams,
  FixtureFormQuestion,
} from '../../support/factories/choice-offer';

export type { FixtureFormQuestion };

const DEFAULT_REQUEST = {
  customer: 'Acme',
  currency: 'USD',
  lines: [{ description: 'Design work', quantity: '20', price: '50' }],
} as const;

/** A Customer question (two options + "Other…") and a typed "Line 1 · Price" question. */
export function defaultFormQuestions(
  customerIds: [string, string]
): FixtureFormQuestion[] {
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

async function createQuestionForm(
  prisma: PrismaClient,
  params: CreateQuestionFormParams
) {
  return prisma.choiceOffer.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      kind: 'FORM',
      lineIndex: null,
      request: params.request === null ? Prisma.DbNull : (params.request ?? DEFAULT_REQUEST),
      options: [],
      questions: (params.questions ?? []) as unknown as Prisma.InputJsonValue,
      answers: params.answers == null ? Prisma.DbNull : params.answers,
      state: params.state ?? 'OPEN',
      chosenOptionId: null,
    },
  });
}

/** Makes the assistant reply `messageId` show the form: the reply's parts become its text plus the form part. */
export async function attachForm(
  prisma: PrismaClient,
  params: CreateQuestionFormParams & { text: string }
): Promise<string> {
  const { text, ...form } = params;
  const offer = await createQuestionForm(prisma, form);
  await prisma.conversationMessage.update({
    where: { id: params.messageId },
    data: {
      parts: [
        { type: 'text', text },
        { type: 'data-offer', id: offer.id, data: { offerId: offer.id } },
      ],
    },
  });
  return offer.id;
}

export const accountLabel = (a: {
  bankName: string;
  accountNumber: string;
}) => `${a.bankName} ••${a.accountNumber.slice(-4)} · USD`;

/** A Bank account question (options only) followed by a typed "Line 1 · Price" question. */
export function accountAndPriceQuestions(
  accounts: Array<{ id: string; bankName: string; accountNumber: string }>
): FixtureFormQuestion[] {
  return [
    {
      questionId: 0,
      field: 'BANK_ACCOUNT',
      lineIndex: null,
      heading: 'Bank account',
      prompt: 'Which account should be paid into?',
      options: accounts.map((a, i) => ({
        optionId: i,
        label: accountLabel(a),
        ref: { bankAccountId: a.id },
      })),
      input: 'NONE',
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
