// T20 (ai-assistant; spec.md §5 AC-11c, AC-13, AC-14, AC-14b, AC-18): storing a Draft card keeps one LIVE card per
// Conversation, and the Create press (createFromCard) is the only way a chat draft comes into existence.
// Expected production module: lib/services/assistant-drafts/cards.ts exporting
//   insertLiveCard(tx, { userId, conversationId, id?, request, proposal }) -> Promise<{ id: string }>
//   createFromCard(actor, cardId, now: Date) -> Promise<ActionResult<CreateFromCardResult>>
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
import { createProduct } from '../../../support/factories/product';
import { createCustomPrice } from '../../../support/factories/custom-price';
import { createConversation } from '../../../support/factories/conversation';
import { createMessageAllowanceDay } from '../../../support/factories/message-allowance-day';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const NOW = new Date('2026-03-15T10:00:00Z');
const SAME_DAY_LATER = new Date('2026-03-15T19:30:00Z');
const NEXT_DAY = new Date('2026-03-16T10:00:00Z');
const TODAY = '2026-03-15';

type Result =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
  | { success: true; data: Record<string, any> }
  | { success: false; code: string; error?: string };
type Svc = {
  insertLiveCard: (
    tx: unknown,
    input: { userId: string; conversationId: string; id?: string; request: unknown; proposal: unknown }
  ) => Promise<{ id: string }>;
  createFromCard: (actor: unknown, cardId: string, now: Date) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('Draft cards and the Create press (T20)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let reads: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
    getConversation: (actor: unknown, id: string) => Promise<any>;
  };
  let turns: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
    saveTurn: (actor: unknown, input: Record<string, unknown>) => Promise<any>;
  };
  let resolver: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
    resolveDraftRequest: (a: unknown, r: unknown, today: string) => Promise<any>;
  };

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
    resolver = (await import('@/lib/services/assistant-drafts/resolve')) as any;
    svc = (await import('@/lib/services/assistant-drafts/cards')) as unknown as Svc;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
    reads = (await import('@/lib/services/conversations')) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
    turns = (await import('@/lib/services/conversations')) as any;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  const REQUEST = {
    customer: 'Acme',
    lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }],
  };

  async function setup(email = 't20-a@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'USD' });
    const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    const conversation = await createConversation(prisma, { userId: user.id });
    return { user, acme, conversation, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  /** Resolves the request as propose_draft would, then stores it as the Conversation's LIVE card. */
  async function storeCard(
    s: { user: { id: string }; conversation: { id: string }; actor: unknown },
    request: Record<string, unknown> = REQUEST,
    today = TODAY
  ) {
    const res = await resolver.resolveDraftRequest(s.actor, request, today);
    if (!res.success || res.data.kind !== 'PROPOSAL') throw new Error('request did not resolve');
    return prisma.$transaction((tx) =>
      svc.insertLiveCard(tx, {
        userId: s.user.id,
        conversationId: s.conversation.id,
        request,
        proposal: res.data.proposal,
      })
    );
  }

  const live = (conversationId: string) =>
    prisma.draftCard.findMany({ where: { conversationId, state: 'LIVE' } });

  describe('storing a card (one LIVE card per Conversation)', () => {
    it('AC-14b: a new card makes the previous one REPLACED, pointing to the newer; nothing is written to invoices', async () => {
      const s = await setup();
      const first = await storeCard(s);
      const second = await storeCard(s, {
        ...REQUEST,
        lines: [{ description: 'consulting', quantity: '25', unit: 'hours', price: '50' }],
      });

      const old = await prisma.draftCard.findUniqueOrThrow({ where: { id: first.id } });
      expect(old.state).toBe('REPLACED');
      expect(old.replacedById).toBe(second.id);
      const liveCards = await live(s.conversation.id);
      expect(liveCards.map((c) => c.id)).toEqual([second.id]);
      expect(await prisma.invoice.count()).toBe(0);
    });
  });

  describe('createFromCard', () => {
    it('AC-13: creates one Draft invoice with the card content, origin CHAT, a system number; card CREATED', async () => {
      const s = await setup();
      const card = await storeCard(s);

      const res = await svc.createFromCard(s.actor, card.id, NOW);

      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.kind).toBe('CREATED');
      const invoices = await prisma.invoice.findMany({ include: { items: true } });
      expect(invoices).toHaveLength(1);
      const inv = invoices[0];
      expect(res.data.invoiceId).toBe(inv.id);
      expect(res.data.invoiceNumber).toBe(inv.invoiceNumber);
      expect(inv.invoiceNumber).toBeTruthy();
      expect(inv.status).toBe('DRAFT');
      expect(inv.assistantOrigin).toBe('CHAT');
      expect(inv.customerId).toBe(s.acme.id);
      expect(inv.currency).toBe('USD');
      expect(Number(inv.total)).toBe(1000);
      expect(inv.items).toHaveLength(1);
      expect(inv.items[0]).toMatchObject({ name: 'consulting', unit: 'hours' });
      expect(Number(inv.items[0].quantity)).toBe(20);
      expect(Number(inv.items[0].rate)).toBe(50);
      expect(Number(inv.items[0].amount)).toBe(1000);

      const stored = await prisma.draftCard.findUniqueOrThrow({ where: { id: card.id } });
      expect(stored.state).toBe('CREATED');
      expect(stored.invoiceId).toBe(inv.id);
    });

    // review-2026-10-12 R-09: what the request set reaches the invoice; nothing is dropped.
    it('carries tax, discount, shipping, PO number, payment terms, notes and terms into the draft', async () => {
      const s = await setup();
      const card = await storeCard(s, {
        ...REQUEST,
        taxRate: '10',
        discount: '50',
        shipping: '20',
        poNumber: 'PO-77',
        paymentTerms: 'Net 15',
        notes: 'Thank you!',
        terms: 'Pay by wire.',
      });

      const res = await svc.createFromCard(s.actor, card.id, NOW);

      expect(res.success && res.data.kind).toBe('CREATED');
      const inv = await prisma.invoice.findFirstOrThrow();
      expect(inv).toMatchObject({ poNumber: 'PO-77', paymentTerms: 'Net 15', notes: 'Thank you!', terms: 'Pay by wire.' });
      expect(Number(inv.taxRate)).toBe(10);
      expect(Number(inv.discount)).toBe(50);
      expect(Number(inv.shipping)).toBe(20);
      // (1000 + 20 - 50) = 970, + 10 % = 1067.00
      expect(Number(inv.total)).toBe(1067);
    });

    it('AC-11c: creates normally with the Daily message allowance used up, and never touches it', async () => {
      const s = await setup();
      const day = new Date(Date.UTC(2026, 2, 15));
      await createMessageAllowanceDay(prisma, { userId: s.user.id, day, used: 30, timeZone: TZ });
      const card = await storeCard(s);

      const res = await svc.createFromCard(s.actor, card.id, NOW);

      expect(res.success && res.data.kind).toBe('CREATED');
      expect(await prisma.invoice.count()).toBe(1);
      const rows = await prisma.messageAllowanceDay.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].used).toBe(30);
    });

    it('same local day, only hours later: still creates (time alone never outdates a card)', async () => {
      const s = await setup();
      const card = await storeCard(s);

      const res = await svc.createFromCard(s.actor, card.id, SAME_DAY_LATER);

      expect(res.success && res.data.kind).toBe('CREATED');
    });

    it('AC-14: a repeated press creates no second draft and returns the link to the first', async () => {
      const s = await setup();
      const card = await storeCard(s);
      const first = await svc.createFromCard(s.actor, card.id, NOW);
      if (!first.success) throw new Error('first press failed');

      const again = await svc.createFromCard(s.actor, card.id, NOW);

      expect(again.success).toBe(true);
      if (!again.success) return;
      expect(again.data.kind).toBe('ALREADY_CREATED');
      expect(again.data.invoice).toMatchObject({
        state: 'DRAFT',
        invoiceId: first.data.invoiceId,
        invoiceNumber: first.data.invoiceNumber,
      });
      expect(await prisma.invoice.count()).toBe(1);
    });

    it('AC-14: two concurrent presses create exactly one invoice', async () => {
      const s = await setup();
      const card = await storeCard(s);

      const [a, b] = await Promise.all([
        svc.createFromCard(s.actor, card.id, NOW),
        svc.createFromCard(s.actor, card.id, NOW),
      ]);

      expect(a.success && b.success).toBe(true);
      const kinds = [a, b].map((r) => (r.success ? r.data.kind : r.code)).sort();
      expect(kinds).toEqual(['ALREADY_CREATED', 'CREATED']);
      expect(await prisma.invoice.count()).toBe(1);
      const stored = await prisma.draftCard.findUniqueOrThrow({ where: { id: card.id } });
      expect(stored.state).toBe('CREATED');
    });

    it('a pressed card whose invoice was deleted since: ALREADY_CREATED with UNAVAILABLE, nothing new created', async () => {
      const s = await setup();
      const card = await storeCard(s);
      const first = await svc.createFromCard(s.actor, card.id, NOW);
      if (!first.success) throw new Error('first press failed');
      await prisma.invoice.delete({ where: { id: first.data.invoiceId } });

      const again = await svc.createFromCard(s.actor, card.id, NOW);

      expect(again.success).toBe(true);
      if (!again.success) return;
      expect(again.data).toMatchObject({ kind: 'ALREADY_CREATED', invoice: { state: 'UNAVAILABLE' } });
      expect(await prisma.invoice.count()).toBe(0);
    });

    it('AC-14b: pressing the replaced first card creates nothing and names the newer card', async () => {
      const s = await setup();
      const first = await storeCard(s);
      const second = await storeCard(s, {
        ...REQUEST,
        lines: [{ description: 'consulting', quantity: '25', unit: 'hours', price: '50' }],
      });

      const res = await svc.createFromCard(s.actor, first.id, NOW);

      expect(res).toEqual({ success: true, data: { kind: 'REPLACED', newerCardId: second.id } });
      expect(await prisma.invoice.count()).toBe(0);
      expect((await live(s.conversation.id)).map((c) => c.id)).toEqual([second.id]);
    });

    it('AC-18: a changed custom price returns OUTDATED with an updated LIVE card; nothing is created', async () => {
      const s = await setup();
      const product = await createProduct(prisma, s.user.id, {
        name: 'Consulting',
        price: 50,
        currency: 'USD',
        unit: 'hour',
      });
      const cp = await createCustomPrice(prisma, product.id, s.acme.id, { price: 45 });
      const request = { customer: 'Acme', lines: [{ description: 'consulting', quantity: '20' }] };
      const card = await storeCard(s, request);
      await prisma.customPrice.update({ where: { id: cp.id }, data: { price: 40 } });

      const res = await svc.createFromCard(s.actor, card.id, NOW);

      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.kind).toBe('OUTDATED');
      expect(res.data.card.state).toBe('LIVE');
      expect(res.data.card.proposal.lines[0]).toMatchObject({ rate: '40.00', amount: '800.00' });
      expect(res.data.card.id).not.toBe(card.id);
      expect(await prisma.invoice.count()).toBe(0);

      const old = await prisma.draftCard.findUniqueOrThrow({ where: { id: card.id } });
      expect(old.state).toBe('OUTDATED');
      expect(old.replacedById).toBe(res.data.card.id);
      expect((await live(s.conversation.id)).map((c) => c.id)).toEqual([res.data.card.id]);

      // Pressing the outdated card again returns its successor, like REPLACED.
      const again = await svc.createFromCard(s.actor, card.id, NOW);
      expect(again).toEqual({
        success: true,
        data: { kind: 'REPLACED', newerCardId: res.data.card.id },
      });

      // The updated card, confirmed again, creates the draft at the new price.
      const confirm = await svc.createFromCard(s.actor, res.data.card.id, NOW);
      expect(confirm.success && confirm.data.kind).toBe('CREATED');
      const inv = await prisma.invoice.findFirstOrThrow({});
      expect(Number(inv.total)).toBe(800);
    });

    it('AC-18: a card pressed on a later local day is OUTDATED (the issue date changed)', async () => {
      const s = await setup();
      const card = await storeCard(s);

      const res = await svc.createFromCard(s.actor, card.id, NEXT_DAY);

      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.kind).toBe('OUTDATED');
      expect(res.data.card.proposal.issueDate.value).toBe('2026-03-16');
      expect(res.data.card.state).toBe('LIVE');
      expect(await prisma.invoice.count()).toBe(0);
    });

    it('a vanished Customer returns NEEDS_ANSWERS: card OUTDATED with no successor, nothing created', async () => {
      const s = await setup();
      const card = await storeCard(s);
      await prisma.customer.delete({ where: { id: s.acme.id } });

      const res = await svc.createFromCard(s.actor, card.id, NOW);

      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.kind).toBe('NEEDS_ANSWERS');
      expect(res.data.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'CUSTOMER_NOT_FOUND' })])
      );
      expect(await prisma.invoice.count()).toBe(0);
      const old = await prisma.draftCard.findUniqueOrThrow({ where: { id: card.id } });
      expect(old.state).toBe('OUTDATED');
      expect(old.replacedById).toBeNull();
      expect(await live(s.conversation.id)).toHaveLength(0);
    });

    it('AC-18, AC-35, AC-36 (R-03): reopening after OUTDATED presses carries every successor in its current state', async () => {
      const s = await setup();
      const card = await storeCard(s);
      // The proposing turn stored a part for the first card only; successors never get a part of their own.
      await prisma.conversationMessage.create({
        data: {
          conversationId: s.conversation.id,
          position: 0,
          role: 'ASSISTANT',
          parts: [{ type: 'data-draft-card', id: 'p1', data: { cardId: card.id } }],
        },
      });

      const first = await svc.createFromCard(s.actor, card.id, NEXT_DAY);
      expect(first.success && first.data.kind).toBe('OUTDATED');
      if (!first.success) return;
      const successorId: string = first.data.card.id;

      const reopened = await reads.getConversation(s.actor, s.conversation.id);
      expect(reopened.success).toBe(true);
      expect(reopened.data.cards[card.id]).toMatchObject({ state: 'OUTDATED', replacedById: successorId });
      expect(reopened.data.cards[successorId]).toEqual(first.data.card);

      // A second outdating press and a confirm: the chain keeps going and the last card shows its invoice.
      const DAY_AFTER = new Date('2026-03-17T10:00:00Z');
      const second = await svc.createFromCard(s.actor, successorId, DAY_AFTER);
      expect(second.success && second.data.kind).toBe('OUTDATED');
      if (!second.success) return;
      const thirdId: string = second.data.card.id;
      const confirm = await svc.createFromCard(s.actor, thirdId, DAY_AFTER);
      expect(confirm.success && confirm.data.kind).toBe('CREATED');
      if (!confirm.success) return;

      const again = await reads.getConversation(s.actor, s.conversation.id);
      expect(Object.keys(again.data.cards).sort()).toEqual([card.id, successorId, thirdId].sort());
      expect(again.data.cards[successorId]).toMatchObject({ state: 'OUTDATED', replacedById: thirdId });
      expect(again.data.cards[thirdId]).toMatchObject({
        state: 'CREATED',
        invoice: { state: 'DRAFT', invoiceId: confirm.data.invoiceId, invoiceNumber: confirm.data.invoiceNumber },
      });
    });

    it('AC-14b, AC-18 (R-04): the OUTDATED successor insert waits for the Conversation row lock (same order as saveTurn)', async () => {
      const s = await setup();
      const card = await storeCard(s);
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      let locked!: () => void;
      const hasLock = new Promise<void>((r) => (locked = r));
      const holder = prisma.$transaction(
        async (tx) => {
          // NO KEY UPDATE still conflicts with saveTurn's FOR UPDATE, but not with the foreign-key share lock an
          // insert takes - so only a press that locks the Conversation row itself waits here.
          await tx.$queryRaw`SELECT "id" FROM "Conversation" WHERE "id" = ${s.conversation.id} FOR NO KEY UPDATE`;
          locked();
          await held;
        },
        { timeout: 30_000 }
      );
      await hasLock;

      let settled = false;
      const press = svc.createFromCard(s.actor, card.id, NEXT_DAY).finally(() => (settled = true));
      await new Promise((r) => setTimeout(r, 1500));
      const settledWhileLocked = settled;
      release();
      await holder;
      const res = await press;

      expect(settledWhileLocked).toBe(false);
      expect(res.success && res.data.kind).toBe('OUTDATED');
    });

    it('AC-14b, AC-18 (R-04): a Create press that outdates a card and a turn proposing a card at once leave exactly one LIVE card', async () => {
      const s = await setup();
      const request = REQUEST;
      for (let round = 0; round < 8; round++) {
        const card = await storeCard(s);
        const resolved = await resolver.resolveDraftRequest(s.actor, request, TODAY);
        const proposal = resolved.data.proposal;
        const [press, saved] = await Promise.all([
          svc.createFromCard(s.actor, card.id, NEXT_DAY),
          turns.saveTurn(s.actor, {
            conversation: { id: s.conversation.id, isNew: false },
            userText: `racer ${round}`,
            assistantParts: [{ type: 'text', text: 'ok' }],
            turn: {
              topic: 'IN_SCOPE',
              outcome: 'ANSWERED',
              counted: false,
              steps: 1,
              toolNames: [],
              durationMs: 1,
              inputTokens: null,
              outputTokens: null,
              costUsd: null,
            },
            proposedCard: { id: `race_${round}`, request, proposal },
          }),
        ]);

        expect(saved.success, JSON.stringify(saved)).toBe(true);
        expect(press.success, JSON.stringify(press)).toBe(true);
        expect((await live(s.conversation.id)).length).toBe(1);
      }
    }, 60_000);

    it("another Freelancer's card and an unknown id are NOT_FOUND; the foreign card is untouched", async () => {
      const owner = await setup('t20-owner@example.com');
      const card = await storeCard(owner);
      const other = await setup('t20-other@example.com');

      const foreign = await svc.createFromCard(other.actor, card.id, NOW);
      const unknown = await svc.createFromCard(other.actor, 'no-such-card', NOW);

      expect(foreign).toEqual({
        success: false,
        code: 'NOT_FOUND',
        error: 'This draft card is no longer available.',
      });
      expect(unknown).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(await prisma.invoice.count()).toBe(0);
      const stored = await prisma.draftCard.findUniqueOrThrow({ where: { id: card.id } });
      expect(stored.state).toBe('LIVE');
    });
  });
});
