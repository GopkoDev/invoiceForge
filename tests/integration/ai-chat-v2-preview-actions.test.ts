// ai-chat-v2 T17 (spec.md §5 AC-20, AC-21, AC-22, AC-23, AC-27, AC-36; ADR-0006, ADR-0007;
// contracts/server-actions.md §loadInvoicePreview, §issueFromPreview): the chat panel's two server actions,
// through the session, against a throwaway Postgres. Neither is a message: the allowance is never touched.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createCustomer } from '../support/factories/customer';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createBankAccount } from '../support/factories/bank-account';
import { createInvoice as seedInvoice } from '../support/factories/invoice';
import { createConversation } from '../support/factories/conversation';
import { createDraftCard } from '../support/factories/draft-card';
import { createMessageAllowanceDay } from '../support/factories/message-allowance-day';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock = vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
const revalidated: string[] = [];
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => void revalidated.push(p) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

type Result = { success: boolean; code?: string; error?: string; details?: any; data?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Actions = {
  loadInvoicePreview: (cardId: unknown, conversationId: unknown) => Promise<Result>;
  issueFromPreview: (invoiceId: unknown, expectedVersion: unknown) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('loadInvoicePreview and issueFromPreview (ai-chat-v2 T17)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let actions: Actions;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    actions = (await import('@/lib/actions/assistant-actions')) as unknown as Actions;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    authMock.mockReset();
    revalidated.length = 0;
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
    const card = await createDraftCard(prisma, { userId: user.id, conversationId: conversation.id, state: 'CREATED', invoiceId: invoice.id });
    return { user, invoice, card };
  }
  const signIn = (user: { id: string; email: string }) => authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
  const invoiceRow = (id: string) => prisma.invoice.findUniqueOrThrow({ where: { id } });

  it('AC-20: the preview of a created card loads with its version and the draft state', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    signIn(a.user);
    const res = await actions.loadInvoicePreview(a.card.id, a.card.conversationId);
    expect(res).toMatchObject({
      success: true,
      data: { kind: 'AVAILABLE', version: 2, state: { state: 'DRAFT', invoiceId: a.invoice.id, invoiceNumber: 'INV-0007' } },
    });
    expect(res.data.invoice).toMatchObject({ id: a.invoice.id, assistantMark: expect.anything() });
  });

  it('AC-21: a deleted invoice is UNAVAILABLE', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    await prisma.invoice.delete({ where: { id: a.invoice.id } });
    signIn(a.user);
    expect(await actions.loadInvoicePreview(a.card.id, a.card.conversationId)).toEqual({ success: true, data: { kind: 'UNAVAILABLE' } });
  });

  it("AC-22: another Freelancer's card and an unknown id give identical NOT_FOUND words", async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    const b = await seedCreatedCard('t17-b@example.com');
    signIn(a.user);
    const foreign = await actions.loadInvoicePreview(b.card.id, b.card.conversationId);
    const unknown = await actions.loadInvoicePreview('clx0unknown00000000000001', a.card.conversationId);
    expect(foreign).toEqual({ success: false, code: 'NOT_FOUND', error: "This invoice can't be found." });
    expect(unknown).toEqual(foreign);
  });

  it('AC-23: issuing returns status, version and the issued state; the number is kept and the mark is gone', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    signIn(a.user);
    const res = await actions.issueFromPreview(a.invoice.id, 2);
    expect(res).toEqual({
      success: true,
      data: {
        status: 'PENDING',
        version: 3,
        invoice: { state: 'ISSUED', invoiceId: a.invoice.id, invoiceNumber: 'INV-0007', status: 'pending' },
      },
    });
    expect(await invoiceRow(a.invoice.id)).toMatchObject({ status: 'PENDING', invoiceNumber: 'INV-0007', issuedFromChat: true });
    const preview = await actions.loadInvoicePreview(a.card.id, a.card.conversationId);
    expect(preview.data.invoice.assistantMark).toBeNull();
    expect(revalidated).toEqual(expect.arrayContaining(['/invoices', '/dashboard']));
  });

  it('issue conflicts pass through: ALREADY_ISSUED and CHANGED_ELSEWHERE in the contract words', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    signIn(a.user);
    const outdated = await actions.issueFromPreview(a.invoice.id, 1);
    expect(outdated).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'This draft was changed after you opened the preview. Check it and issue again.',
      details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 2 },
    });
    expect((await actions.issueFromPreview(a.invoice.id, 2)).success).toBe(true);
    const again = await actions.issueFromPreview(a.invoice.id, 3);
    expect(again).toMatchObject({
      success: false,
      code: 'CONFLICT',
      error: 'This invoice has already been issued.',
      details: { kind: 'ALREADY_ISSUED', invoice: { state: 'ISSUED', invoiceId: a.invoice.id } },
    });
  });

  it("issue of an unknown or another Freelancer's invoice is NOT_FOUND 'This invoice is no longer available.'", async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    const b = await seedCreatedCard('t17-b@example.com');
    signIn(a.user);
    const foreign = await actions.issueFromPreview(b.invoice.id, 2);
    const unknown = await actions.issueFromPreview('clx0unknown00000000000001', 2);
    expect(foreign).toEqual({ success: false, code: 'NOT_FOUND', error: 'This invoice is no longer available.' });
    expect(unknown).toEqual(foreign);
    expect((await invoiceRow(b.invoice.id)).status).toBe('DRAFT');
  });

  it('AC-27: with 30 of 30 messages used, the preview loads and the invoice issues; the count stays 30', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    await createMessageAllowanceDay(prisma, { userId: a.user.id, used: 30 });
    signIn(a.user);
    expect((await actions.loadInvoicePreview(a.card.id, a.card.conversationId)).success).toBe(true);
    expect((await actions.issueFromPreview(a.invoice.id, 2)).success).toBe(true);
    const days = await prisma.messageAllowanceDay.findMany({ where: { userId: a.user.id } });
    expect(days.map((d) => d.used)).toEqual([30]);
  });

  it('AC-36: without a session both actions are UNAUTHORIZED and nothing changes', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    authMock.mockResolvedValue(null);
    expect(await actions.loadInvoicePreview(a.card.id, a.card.conversationId)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(await actions.issueFromPreview(a.invoice.id, 2)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(await invoiceRow(a.invoice.id)).toMatchObject({ status: 'DRAFT', version: 2 });
  });

  it.each([[-1], [1.5], ['2'], [null]])('expectedVersion %j is VALIDATION and nothing changes', async (version) => {
    const a = await seedCreatedCard('t17-a@example.com');
    signIn(a.user);
    expect(await actions.issueFromPreview(a.invoice.id, version)).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(await invoiceRow(a.invoice.id)).toMatchObject({ status: 'DRAFT', version: 2 });
  });

  it('a malformed id is VALIDATION for issue and NOT_FOUND for the preview', async () => {
    const a = await seedCreatedCard('t17-a@example.com');
    signIn(a.user);
    expect(await actions.issueFromPreview('', 2)).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(await actions.loadInvoicePreview(42, 'c1')).toEqual({ success: false, code: 'NOT_FOUND', error: "This invoice can't be found." });
  });
});

describe.runIf(!containerRuntimeAvailable)('loadInvoicePreview and issueFromPreview (ai-chat-v2 T17)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
