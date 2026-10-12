// ai-chat-v2 T02: a stored set of Offered choices tied to an ASSISTANT reply. Defaults: CUSTOMER, OPEN, two options
// "Acme Corp (billing@acme.example.test)" / "Acme GmbH (no email)". `request` and `options` are typed literals until
// T10 lands the production zod schemas; then they are built by those schemas so a fixture cannot drift.
// Fixture text only, never real data.

import type { ChoiceOffer, ChoiceOfferKind, ChoiceOfferState, Prisma, PrismaClient } from '@prisma/client';

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
