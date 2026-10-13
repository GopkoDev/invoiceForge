// ai-chat-v2 T17 (spec.md §5 AC-20, AC-21, AC-22; ADR-0006; contracts/server-actions.md §loadInvoicePreview):
// getCardInvoicePreview reads a CREATED Draft card's invoice owner-scoped, as the list's preview renders it,
// with its version and link state. Request-free, against a throwaway Postgres. No session, no next/*.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';
import { createConversation } from '../../../support/factories/conversation';
import { createDraftCard } from '../../../support/factories/draft-card';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = { success: boolean; code?: string; error?: string; data?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Svc = { getCardInvoicePreview: (a: unknown, cardId: string) => Promise<Result> };

const NOT_FOUND = { success: false, code: 'NOT_FOUND', error: "This invoice can't be found." };

describe.runIf(containerRuntimeAvailable)('getCardInvoicePreview (ai-chat-v2 T17)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/cards')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seedCreatedCard(email: string, invoiceOverrides: Record<string, unknown> = {}) {
    const user = await createFreelancer(prisma, { email });
    const senderProfile = await createSenderProfile(prisma, user.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    const invoice = await seedInvoice(prisma, {
      senderProfile,
      customer,
      bankAccount,
      items: [{ name: 'Design work', quantity: 1, rate: 1000, amount: 1000 }],
      overrides: { invoiceNumber: 'INV-0007', status: 'DRAFT', version: 2, assistantOrigin: 'CHAT', ...invoiceOverrides } as never,
    });
    const conversation = await createConversation(prisma, { userId: user.id });
    const card = await createDraftCard(prisma, {
      userId: user.id,
      conversationId: conversation.id,
      state: 'CREATED',
      invoiceId: invoice.id,
    });
    return { user, invoice, conversation, card };
  }

  it('AC-20: a CREATED card of this Freelancer is AVAILABLE with the serialized invoice, its version and DRAFT state', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.getCardInvoicePreview(actor, a.card.id);
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      kind: 'AVAILABLE',
      version: 2,
      state: { state: 'DRAFT', invoiceId: a.invoice.id, invoiceNumber: 'INV-0007' },
      invoice: { id: a.invoice.id, invoiceNumber: 'INV-0007', total: 1000, senderProfile: { id: a.invoice.senderProfileId } },
    });
    expect(res.data.invoice.items).toHaveLength(1);
  });

  it('an issued invoice is AVAILABLE with an ISSUED state', async () => {
    const a = await seedCreatedCard('t17-a@example.com', { status: 'PENDING', issuedAt: new Date() });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.getCardInvoicePreview(actor, a.card.id);
    expect(res.data).toMatchObject({ kind: 'AVAILABLE', state: { state: 'ISSUED', status: 'pending' } });
  });

  it('AC-21: a CREATED card whose invoice was deleted is UNAVAILABLE', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    await prisma.invoice.delete({ where: { id: a.invoice.id } });
    const actor = await actingFreelancerForTest(a.user.id);
    expect(await svc.getCardInvoicePreview(actor, a.card.id)).toEqual({ success: true, data: { kind: 'UNAVAILABLE' } });
  });

  it('a LIVE or REPLACED card is NOT_FOUND in the same words', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const live = await createDraftCard(prisma, { userId: a.user.id, conversationId: a.conversation.id, state: 'LIVE' });
    const replaced = await createDraftCard(prisma, { userId: a.user.id, conversationId: a.conversation.id, state: 'REPLACED' });
    expect(await svc.getCardInvoicePreview(actor, live.id)).toEqual(NOT_FOUND);
    expect(await svc.getCardInvoicePreview(actor, replaced.id)).toEqual(NOT_FOUND);
  });

  it("AC-22: getCardInvoicePreview on Freelancer B's card is NOT_FOUND exactly like an unknown id (foreign record)", async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    const b = await seedCreatedCard('t17-b@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const foreign = await svc.getCardInvoicePreview(actor, b.card.id);
    const unknown = await svc.getCardInvoicePreview(actor, 'never-existed');
    expect(foreign).toEqual(NOT_FOUND);
    expect(unknown).toEqual(NOT_FOUND);
  });
});

describe.runIf(!containerRuntimeAvailable)('getCardInvoicePreview (ai-chat-v2 T17)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
