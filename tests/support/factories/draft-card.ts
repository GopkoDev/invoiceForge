// DraftCard factory. Default: a LIVE card for a 20 x 50.00 USD line. Until T03 lands, request and
// proposal are plain JSON objects; T03 switches them to the production zod schemas.

import type { DraftCard, DraftCardState, Prisma, PrismaClient } from '@prisma/client';

export interface CreateDraftCardParams {
  userId: string;
  conversationId: string;
  state?: DraftCardState;
  request?: Prisma.InputJsonValue;
  proposal?: Prisma.InputJsonValue;
  invoiceId?: string | null;
  replacedById?: string | null;
}

const DEFAULT_REQUEST: Prisma.InputJsonValue = {
  customer: 'Acme Corp',
  items: [{ name: 'Consulting', quantity: 20, rate: '50.00' }],
  currency: 'USD',
};

const DEFAULT_PROPOSAL: Prisma.InputJsonValue = {
  customer: { name: 'Acme Corp' },
  items: [{ name: 'Consulting', quantity: 20, rate: '50.00', amount: '1000.00' }],
  currency: 'USD',
  total: '1000.00',
};

export async function createDraftCard(prisma: PrismaClient, params: CreateDraftCardParams): Promise<DraftCard> {
  return prisma.draftCard.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId,
      state: params.state ?? 'LIVE',
      request: params.request ?? DEFAULT_REQUEST,
      proposal: params.proposal ?? DEFAULT_PROPOSAL,
      invoiceId: params.invoiceId ?? null,
      replacedById: params.replacedById ?? null,
    },
  });
}
