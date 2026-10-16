// T10 (ai-assistant; spec.md §5 AC-35, AC-36, AC-41) - Conversations are listed and opened owner-scoped:
// newest first, 20 per page, messages in position order, a DraftCardView per card part and the
// current state of every linked invoice; another Freelancer's id answers exactly as an unknown id.
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
import { createInvoice } from '../../../support/factories/invoice';
import { createConversation } from '../../../support/factories/conversation';
import { createDraftCard } from '../../../support/factories/draft-card';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const NOT_FOUND = { success: false, code: 'NOT_FOUND', error: "This conversation can't be found." };

type Failure = { success: false; code: string; error: string };
type Linked =
  | { state: 'DRAFT'; invoiceId: string; invoiceNumber: string }
  | { state: 'ISSUED'; invoiceId: string; invoiceNumber: string; status: string }
  | { state: 'UNAVAILABLE' };
type Part = { type: string; text?: string; data?: unknown; id?: string };
type Opened = {
  conversation: { id: string; title: string; lastMessageAt: string };
  messages: Array<{ id: string; role: string; parts: Part[]; createdAt: string }>;
  cards: Record<string, { id: string; state: string; replacedById: string | null; invoice: Linked | null }>;
  invoiceLinks: Record<string, Linked>;
};
type Listed = {
  items: Array<{ id: string; title: string; lastMessageAt: string }>;
  total: number;
  page: number;
  totalPages: number;
};
type Svc = {
  listConversationSummaries: (actor: unknown) => Promise<{ success: true; data: { items: Listed['items']; timeZone: string } } | Failure>;
  getConversation: (actor: unknown, id: string) => Promise<{ success: true; data: Opened } | Failure>;
  loadHistory: (actor: unknown, conversationId: string) => Promise<unknown>;
};

describe.runIf(containerRuntimeAvailable)('Conversation reads (T10)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/conversations')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function freelancer(email = 't10-a@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    return { user, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  async function parties(userId: string) {
    const senderProfile = await createSenderProfile(prisma, userId, { name: 'Main' });
    const bankAccount = await createBankAccount(prisma, senderProfile.id, { currency: 'USD' });
    const customer = await createCustomer(prisma, userId, { name: 'Acme Corp' });
    return { senderProfile, bankAccount, customer };
  }

  async function invoiceFor(
    userId: string,
    number: string,
    overrides: Record<string, unknown> = {}
  ) {
    const p = await parties(userId);
    return createInvoice(prisma, { ...p, overrides: { invoiceNumber: number, ...overrides } });
  }

  const proposal = (customerId: string, senderProfileId: string, bankAccountId: string) => ({
    customer: { customerId, name: { freelancerText: 'Acme Corp' }, source: 'REQUEST' },
    senderProfile: { senderProfileId, name: { freelancerText: 'Main' }, source: 'DEFAULT' },
    bankAccount: { bankAccountId, label: 'Test Bank', currency: 'USD', source: 'DEFAULT' },
    currency: 'USD',
    issueDate: { value: '2026-03-15', source: 'DEFAULT' },
    dueDate: { value: '2026-04-14', source: 'DEFAULT' },
    lines: [
      {
        name: 'Consulting',
        productId: null,
        quantity: '20.00',
        unit: 'hour',
        rate: '50.00',
        amount: '1000.00',
        quantitySource: 'REQUEST',
        unitSource: 'DEFAULT',
        rateSource: 'REQUEST',
      },
    ],
    subtotal: '1000.00',
    total: '1000.00',
    defaultsUsed: [],
  });

  async function opened(actor: unknown, id: string): Promise<Opened> {
    const res = await svc.getConversation(actor, id);
    if (!res.success) throw new Error(JSON.stringify(res));
    return res.data;
  }

  async function seedDraftConv(userId: string, invoiceIds: string[]) {
    const conv = await createConversation(prisma, {
      userId,
      messages: [
        { role: 'USER', text: 'Invoice Acme' },
        {
          role: 'ASSISTANT',
          parts: invoiceIds.map((invoiceId) => ({
            type: 'data-link',
            data: { kind: 'invoice', invoiceId, label: 'Draft' },
          })),
        },
      ],
    });
    return conv;
  }

  it('AC-35: lists only the actor Conversations, newest lastMessageAt first, with title and date', async () => {
    const a = await freelancer();
    const b = await freelancer('t10-b@example.com');
    const old = await createConversation(prisma, {
      userId: a.user.id,
      title: 'Old',
      lastMessageAt: new Date('2026-01-01T10:00:00Z'),
    });
    const fresh = await createConversation(prisma, {
      userId: a.user.id,
      title: 'Fresh',
      lastMessageAt: new Date('2026-03-01T10:00:00Z'),
    });
    await createConversation(prisma, { userId: b.user.id, title: 'Theirs' });

    const res = await svc.listConversationSummaries(a.actor);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.items.map((c) => c.id)).toEqual([fresh.id, old.id]);
    expect(res.data.items[0]).toMatchObject({ title: 'Fresh', lastMessageAt: '2026-03-01T10:00:00.000Z' });
  });

  it('AC-35 (ai-chat-v2 T19: no paging): every summary, newest first', async () => {
    const a = await freelancer();
    for (let i = 0; i < 25; i++) {
      await createConversation(prisma, {
        userId: a.user.id,
        title: `C${i}`,
        lastMessageAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      });
    }

    const all = await svc.listConversationSummaries(a.actor);

    if (!all.success) throw new Error('expected success');
    expect(all.data.items).toHaveLength(25);
    expect(all.data.items[0].title).toBe('C24');
    expect(all.data.items[24].title).toBe('C0');
  });

  it('AC-35: opening returns the whole exchange in position order, and writes nothing', async () => {
    const a = await freelancer();
    const conv = await createConversation(prisma, {
      userId: a.user.id,
      lastMessageAt: new Date('2026-02-02T08:00:00Z'),
    });
    // Inserted out of order on purpose: the read must order by position.
    await prisma.conversationMessage.createMany({
      data: [
        { conversationId: conv.id, position: 2, role: 'USER', parts: [{ type: 'text', text: 'third' }] },
        { conversationId: conv.id, position: 0, role: 'USER', parts: [{ type: 'text', text: 'first' }] },
        { conversationId: conv.id, position: 1, role: 'ASSISTANT', parts: [{ type: 'text', text: 'second' }] },
      ],
    });
    const before = await prisma.conversationMessage.count({ where: { conversationId: conv.id } });

    const data = await opened(a.actor, conv.id);

    expect(data.conversation).toMatchObject({ id: conv.id, lastMessageAt: '2026-02-02T08:00:00.000Z' });
    expect(data.messages.map((m) => m.parts[0].text)).toEqual(['first', 'second', 'third']);
    expect(data.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(await prisma.conversationMessage.count({ where: { conversationId: conv.id } })).toBe(before);
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(row.lastMessageAt.toISOString()).toBe('2026-02-02T08:00:00.000Z');
  });

  it('AC-41: another Freelancer id answers byte-identically to an unknown id', async () => {
    const a = await freelancer();
    const b = await freelancer('t10-b@example.com');
    const conv = await createConversation(prisma, { userId: a.user.id });

    const foreign = await svc.getConversation(b.actor, conv.id);
    const unknown = await svc.getConversation(b.actor, 'no-such-conversation');

    expect(foreign).toMatchObject(NOT_FOUND);
    expect(JSON.stringify(foreign)).toBe(JSON.stringify(unknown));
    expect(await opened(a.actor, conv.id)).toMatchObject({ conversation: { id: conv.id } });
  });

  it('AC-36: a draft link shows DRAFT, an issued one ISSUED with its display status', async () => {
    const a = await freelancer();
    const draft = await invoiceFor(a.user.id, 'T10-0001');
    const paid = await invoiceFor(a.user.id, 'T10-0002', { status: 'PAID', issuedAt: new Date('2026-02-01T00:00:00Z') });
    const pending = await invoiceFor(a.user.id, 'T10-0003', {
      status: 'PENDING',
      issuedAt: new Date('2026-02-01T00:00:00Z'),
      dueDate: new Date('2099-01-01T00:00:00Z'),
    });
    const conv = await seedDraftConv(a.user.id, [draft.id, paid.id, pending.id]);

    const data = await opened(a.actor, conv.id);

    expect(data.invoiceLinks[draft.id]).toEqual({ state: 'DRAFT', invoiceId: draft.id, invoiceNumber: 'T10-0001' });
    expect(data.invoiceLinks[paid.id]).toEqual({
      state: 'ISSUED',
      invoiceId: paid.id,
      invoiceNumber: 'T10-0002',
      status: 'paid',
    });
    expect(data.invoiceLinks[pending.id]).toEqual({
      state: 'ISSUED',
      invoiceId: pending.id,
      invoiceNumber: 'T10-0003',
      status: 'pending',
    });
  });

  it('AC-36: a deleted invoice and another Freelancer invoice are both UNAVAILABLE, never its data', async () => {
    const a = await freelancer();
    const b = await freelancer('t10-b@example.com');
    const gone = await invoiceFor(a.user.id, 'T10-0001');
    const foreign = await invoiceFor(b.user.id, 'T10-0002');
    const conv = await seedDraftConv(a.user.id, [gone.id, foreign.id]);
    await prisma.invoice.delete({ where: { id: gone.id } });

    const data = await opened(a.actor, conv.id);

    expect(data.invoiceLinks[gone.id]).toEqual({ state: 'UNAVAILABLE' });
    expect(data.invoiceLinks[foreign.id]).toEqual({ state: 'UNAVAILABLE' });
    expect(JSON.stringify(data)).not.toContain('T10-0002');
  });

  it('AC-36: every card part has its DraftCardView; the created card carries its invoice current state', async () => {
    const a = await freelancer();
    const p = await parties(a.user.id);
    const inv = await createInvoice(prisma, {
      ...p,
      overrides: { invoiceNumber: 'T10-0009', status: 'PAID', issuedAt: new Date('2026-02-01T00:00:00Z') },
    });
    const conv = await createConversation(prisma, { userId: a.user.id, messages: [{ role: 'USER' }] });
    const prop = proposal(p.customer.id, p.senderProfile.id, p.bankAccount.id);
    const created = await createDraftCard(prisma, {
      userId: a.user.id,
      conversationId: conv.id,
      state: 'CREATED',
      proposal: prop,
      invoiceId: inv.id,
    });
    const orphan = await createDraftCard(prisma, {
      userId: a.user.id,
      conversationId: conv.id,
      state: 'CREATED',
      proposal: prop,
      invoiceId: null,
    });
    const live = await createDraftCard(prisma, { userId: a.user.id, conversationId: conv.id, state: 'LIVE', proposal: prop });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conv.id,
        position: 1,
        role: 'ASSISTANT',
        parts: [created.id, orphan.id, live.id].map((cardId) => ({
          type: 'data-draft-card',
          id: cardId,
          data: { cardId },
        })),
      },
    });

    const data = await opened(a.actor, conv.id);

    expect(Object.keys(data.cards).sort()).toEqual([created.id, orphan.id, live.id].sort());
    expect(data.cards[created.id]).toMatchObject({
      id: created.id,
      state: 'CREATED',
      replacedById: null,
      invoice: { state: 'ISSUED', invoiceId: inv.id, invoiceNumber: 'T10-0009', status: 'paid' },
    });
    expect(data.cards[orphan.id].invoice).toEqual({ state: 'UNAVAILABLE' });
    expect(data.cards[live.id]).toMatchObject({ state: 'LIVE', invoice: null });
    expect(data.invoiceLinks[inv.id]).toMatchObject({ state: 'ISSUED' });
  });

  it('AC-18, AC-36 (R-03): an OUTDATED card brings its successor chain without a part; never another Freelancer card', async () => {
    const a = await freelancer();
    const b = await freelancer('t10-b@example.com');
    const p = await parties(a.user.id);
    const pb = await parties(b.user.id);
    const prop = proposal(p.customer.id, p.senderProfile.id, p.bankAccount.id);
    const conv = await createConversation(prisma, { userId: a.user.id, messages: [{ role: 'USER' }] });
    const third = await createDraftCard(prisma, { userId: a.user.id, conversationId: conv.id, state: 'LIVE', proposal: prop });
    const second = await createDraftCard(prisma, {
      userId: a.user.id,
      conversationId: conv.id,
      state: 'OUTDATED',
      proposal: prop,
      replacedById: third.id,
    });
    const first = await createDraftCard(prisma, {
      userId: a.user.id,
      conversationId: conv.id,
      state: 'OUTDATED',
      proposal: prop,
      replacedById: second.id,
    });
    // A tampered pointer to another Freelancer's card must never surface that card.
    const foreignConv = await createConversation(prisma, { userId: b.user.id });
    const foreign = await createDraftCard(prisma, {
      userId: b.user.id,
      conversationId: foreignConv.id,
      state: 'LIVE',
      proposal: proposal(pb.customer.id, pb.senderProfile.id, pb.bankAccount.id),
    });
    const tampered = await createDraftCard(prisma, {
      userId: a.user.id,
      conversationId: conv.id,
      state: 'OUTDATED',
      proposal: prop,
      replacedById: foreign.id,
    });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conv.id,
        position: 1,
        role: 'ASSISTANT',
        parts: [first.id, tampered.id].map((cardId) => ({ type: 'data-draft-card', id: cardId, data: { cardId } })),
      },
    });

    const data = await opened(a.actor, conv.id);

    expect(Object.keys(data.cards).sort()).toEqual([first.id, second.id, third.id, tampered.id].sort());
    expect(data.cards[second.id]).toMatchObject({ state: 'OUTDATED', replacedById: third.id });
    expect(data.cards[third.id]).toMatchObject({ state: 'LIVE', invoice: null });
    expect(data.cards[foreign.id]).toBeUndefined();
  });

  it('malformed stored parts fail with FAILED, never raw JSON', async () => {
    const a = await freelancer();
    const conv = await createConversation(prisma, {
      userId: a.user.id,
      messages: [{ role: 'USER', parts: [{ type: 'bogus', secret: 'RAW-LEAK' }] }],
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await svc.getConversation(a.actor, conv.id);

    errSpy.mockRestore();
    expect(res).toMatchObject({ success: false, code: 'FAILED' });
    expect(JSON.stringify(res)).not.toContain('RAW-LEAK');
  });

  it('loadHistory returns at most the latest 40 messages, oldest first', async () => {
    const a = await freelancer();
    const conv = await createConversation(prisma, {
      userId: a.user.id,
      messages: Array.from({ length: 45 }, (_, i) => ({
        role: (i % 2 === 0 ? 'USER' : 'ASSISTANT') as 'USER' | 'ASSISTANT',
        text: `m${i}`,
      })),
    });

    const raw = (await svc.loadHistory(a.actor, conv.id)) as unknown;
    const list = (Array.isArray(raw) ? raw : (raw as { data: unknown }).data) as Array<{ parts: Part[] }>;

    expect(list).toHaveLength(40);
    expect(list.map((m) => m.parts[0].text)).toEqual(Array.from({ length: 40 }, (_, i) => `m${i + 5}`));
  });
});
