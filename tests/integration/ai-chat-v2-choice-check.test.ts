// ai-chat-v2 T12 (spec.md §5 AC-11, AC-12b, AC-13; contracts/server-actions.md §Chat route internals, checkChoice;
// data-model.md §ChoiceOffer Claim / Release): the server-side gate for a pressed choice. checkChoice is read-only and
// answers { ok: false } the same way for every cause; claimOffer / releaseOffer move OPEN <-> CHOSEN; reserveAndClaim
// takes the allowance slot and claims the offer in ONE transaction.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createId } from '@paralleldrive/cuid2';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createConversation } from '../support/factories/conversation';
import { createChoiceOffer } from '../support/factories/choice-offer';
import { createCustomer } from '../support/factories/customer';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createBankAccount } from '../support/factories/bank-account';
import { createProduct } from '../support/factories/product';
import { createMessageAllowanceDay } from '../support/factories/message-allowance-day';
import { actingFreelancerForTest } from '../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@/auth', () => ({ auth: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const TZ = 'Europe/Kyiv';

type Ref = Record<string, string>;
type Option = { optionId: number; label: string; ref: Ref };
type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type Check =
  | {
      ok: true;
      offer: {
        id: string;
        kind: string;
        lineIndex: number | null;
        request: unknown;
      };
      option: Option;
    }
  | { ok: false };
type Reserve =
  | { ok: true; state: { used: number }; release: () => Promise<{ used: number }> }
  | { ok: false; usedUp: { kind: string } }
  | { ok: false; claimLost: true }
  | { ok: false; unavailable: true };
type Svc = {
  checkChoice: (
    actor: Actor,
    input: { conversationId: string; offerId: string; optionId: number }
  ) => Promise<Check>;
  claimOffer: (
    tx: Tx,
    actor: Actor,
    offerId: string,
    optionId: number
  ) => Promise<boolean>;
  releaseOffer: (tx: Tx, offerId: string) => Promise<void>;
  reserveAndClaim: (
    actor: Actor,
    now: Date,
    offerId: string,
    optionId: number
  ) => Promise<Reserve>;
};

describe.runIf(containerRuntimeAvailable)(
  'Checking, claiming and releasing a pressed choice (T12)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let svc: Svc;
    let allowanceDay: (now: Date) => Date;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      svc = (await import(
        '@/lib/services/assistant-drafts/offers'
      )) as unknown as Svc;
      const cal = await import('@/lib/helpers/calendar-day');
      allowanceDay = (now) => cal.dayToUtcDate(cal.todayInZone(TZ, now));
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    async function freelancer(email = 't12-a@example.com') {
      const user = await createFreelancer(prisma, { email, timeZone: TZ });
      return { user, actor: await actingFreelancerForTest(user.id, TZ) };
    }

    async function offerFor(
      userId: string,
      opts: {
        kind?: 'CUSTOMER' | 'SENDER_PROFILE' | 'PRODUCT' | 'BANK_ACCOUNT' | 'CURRENCY';
        options: Option[];
        request?: Record<string, unknown>;
        state?: 'OPEN' | 'CHOSEN' | 'CLOSED';
        chosenOptionId?: number | null;
        lineIndex?: number | null;
      }
    ) {
      const messageId = createId();
      const offerId = createId();
      const conversation = await createConversation(prisma, {
        userId,
        messages: [
          { role: 'USER' },
          {
            role: 'ASSISTANT',
            id: messageId,
            parts: [
              { type: 'text', text: 'Which one?' },
              { type: 'data-offer', id: offerId, data: { offerId } },
            ],
          },
        ],
      });
      const offer = await createChoiceOffer(prisma, {
        id: offerId,
        userId,
        conversationId: conversation.id,
        messageId,
        kind: opts.kind ?? 'CUSTOMER',
        lineIndex: opts.lineIndex ?? null,
        request: (opts.request ?? { customer: 'Acme', currency: 'USD' }) as never,
        options: opts.options,
        state: opts.state,
        chosenOptionId: opts.chosenOptionId,
      });
      return { conversation, offer };
    }

    const opt = (optionId: number, ref: Ref): Option => ({
      optionId,
      label: `Option ${optionId}`,
      ref,
    });

    const check = (
      actor: Actor,
      conversationId: string,
      offerId: string,
      optionId = 0
    ) => svc.checkChoice(actor, { conversationId, offerId, optionId });

    const offerRow = (id: string) =>
      prisma.choiceOffer.findUniqueOrThrow({ where: { id } });

    // ---- positive cases --------------------------------------------------------------------------------------------

    it('AC-12b: a valid CUSTOMER press is ok with the stored request and the option', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const options = [opt(0, { customerId: c.id })];
      const request = { customer: 'Acme', currency: 'USD', lines: [] };
      const { conversation, offer } = await offerFor(user.id, { options, request });

      const r = await check(actor, conversation.id, offer.id);

      expect(r).toEqual({
        ok: true,
        offer: { id: offer.id, kind: 'CUSTOMER', lineIndex: null, request },
        option: options[0],
      });
    });

    it('AC-12b: a valid BANK_ACCOUNT press (request currency and sender profile) is ok', async () => {
      const { user, actor } = await freelancer();
      const sp = await createSenderProfile(prisma, user.id);
      const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
      const options = [opt(0, { bankAccountId: acc.id })];
      const request = { customer: 'Acme', currency: 'USD', senderProfileId: sp.id };
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'BANK_ACCOUNT',
        options,
        request,
      });

      const r = await check(actor, conversation.id, offer.id);

      expect(r).toEqual({
        ok: true,
        offer: { id: offer.id, kind: 'BANK_ACCOUNT', lineIndex: null, request },
        option: options[0],
      });
    });

    it('AC-12b: a valid PRODUCT press is ok and carries the line index', async () => {
      const { user, actor } = await freelancer();
      const p = await createProduct(prisma, user.id, { currency: 'USD' });
      const options = [opt(0, { productId: p.id })];
      // A PRODUCT offer fills an existing line: the stored request has the line its lineIndex names (T14).
      const request = {
        customer: 'Acme',
        currency: 'USD',
        lines: [
          { description: 'Design', quantity: '1', price: '10' },
          { description: 'Sticker', quantity: '2' },
        ],
      };
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'PRODUCT',
        lineIndex: 1,
        options,
        request,
      });

      const r = await check(actor, conversation.id, offer.id);

      expect(r).toEqual({
        ok: true,
        offer: { id: offer.id, kind: 'PRODUCT', lineIndex: 1, request },
        option: options[0],
      });
    });

    // Review 2026-10-13 R1-B1: the stored request keeps the currency as the Freelancer wrote it ("$", "€",
    // "dollars"); the fit check reads it the way the resolver did, never as a raw code.
    it.each([
      ['$', 'USD'],
      ['dollars', 'USD'],
      ['usd', 'USD'],
    ])('AC-08b: a BANK_ACCOUNT press with the currency written as "%s" fits a %s account', async (written, code) => {
      const { user, actor } = await freelancer();
      const sp = await createSenderProfile(prisma, user.id);
      const acc = await createBankAccount(prisma, sp.id, { currency: code as 'USD' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'BANK_ACCOUNT',
        options: [opt(0, { bankAccountId: acc.id })],
        request: { customer: 'Acme', currency: written, senderProfileId: sp.id },
      });

      expect((await check(actor, conversation.id, offer.id)).ok).toBe(true);
    });

    it('AC-08b: a PRODUCT press with the currency written as "€" fits a EUR product', async () => {
      const { user, actor } = await freelancer();
      const p = await createProduct(prisma, user.id, { currency: 'EUR' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'PRODUCT',
        lineIndex: 0,
        options: [opt(0, { productId: p.id })],
        request: { customer: 'Acme', currency: '€', lines: [{ description: 'Audit', quantity: '1' }] },
      });

      expect((await check(actor, conversation.id, offer.id)).ok).toBe(true);
    });

    it('AC-13: a BANK_ACCOUNT press with the currency written as "€" does not fit a USD account', async () => {
      const { user, actor } = await freelancer();
      const sp = await createSenderProfile(prisma, user.id);
      const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'BANK_ACCOUNT',
        options: [opt(0, { bankAccountId: acc.id })],
        request: { customer: 'Acme', currency: '€' },
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-12b: a valid SENDER_PROFILE press is ok', async () => {
      const { user, actor } = await freelancer();
      const sp = await createSenderProfile(prisma, user.id);
      const options = [opt(0, { senderProfileId: sp.id })];
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'SENDER_PROFILE',
        options,
      });

      const r = await check(actor, conversation.id, offer.id);

      expect(r.ok).toBe(true);
      expect(r.ok && r.option).toEqual(options[0]);
    });

    it('AC-12b: a CURRENCY press is always ok', async () => {
      const { user, actor } = await freelancer();
      const options = [opt(0, { currency: 'EUR' }), opt(1, { currency: 'USD' })];
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'CURRENCY',
        options,
      });

      const r = await check(actor, conversation.id, offer.id, 1);

      expect(r.ok).toBe(true);
      expect(r.ok && r.option).toEqual(options[1]);
    });

    // ---- each { ok: false } cause ----------------------------------------------------------------------------------

    it('AC-12b: an unknown offer id is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const { conversation } = await offerFor(user.id, {
        options: [opt(0, { customerId: c.id })],
      });

      expect(await check(actor, conversation.id, 'offer_missing')).toEqual({
        ok: false,
      });
    });

    it("AC-12b: another Freelancer's offer (and their customer) is { ok: false }", async () => {
      const { actor } = await freelancer('t12-a@example.com');
      const other = await createFreelancer(prisma, {
        email: 't12-b@example.com',
        timeZone: TZ,
      });
      const theirs = await createCustomer(prisma, other.id);
      const { conversation, offer } = await offerFor(other.id, {
        options: [opt(0, { customerId: theirs.id })],
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it("AC-12b: my offer naming another Freelancer's customer is { ok: false }", async () => {
      const { user, actor } = await freelancer('t12-a@example.com');
      const other = await createFreelancer(prisma, {
        email: 't12-b@example.com',
        timeZone: TZ,
      });
      const theirs = await createCustomer(prisma, other.id);
      const { conversation, offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: theirs.id })],
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-12b: an offer of another Conversation of the same Freelancer is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const { offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: c.id })],
      });
      const elsewhere = await createConversation(prisma, {
        userId: user.id,
        messages: [{ role: 'USER' }, { role: 'ASSISTANT' }],
      });

      expect(await check(actor, elsewhere.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-12b: a CLOSED offer is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const { conversation, offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: c.id })],
        state: 'CLOSED',
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-12b: a CHOSEN offer is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const { conversation, offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: c.id })],
        state: 'CHOSEN',
        chosenOptionId: 0,
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-12b: an option id that is not among the options is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const { conversation, offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: c.id })],
      });

      expect(await check(actor, conversation.id, offer.id, 5)).toEqual({
        ok: false,
      });
    });

    it('AC-13: a CUSTOMER deleted since is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const { conversation, offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: c.id })],
      });
      await prisma.customer.delete({ where: { id: c.id } });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-13: a BANK_ACCOUNT deleted since is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const sp = await createSenderProfile(prisma, user.id);
      const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'BANK_ACCOUNT',
        options: [opt(0, { bankAccountId: acc.id })],
      });
      await prisma.bankAccount.delete({ where: { id: acc.id } });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it("AC-13: a BANK_ACCOUNT now in another currency than the request's is { ok: false }", async () => {
      const { user, actor } = await freelancer();
      const sp = await createSenderProfile(prisma, user.id);
      const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'BANK_ACCOUNT',
        options: [opt(0, { bankAccountId: acc.id })],
        request: { customer: 'Acme', currency: 'USD' },
      });
      await prisma.bankAccount.update({
        where: { id: acc.id },
        data: { currency: 'EUR' },
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it("AC-13: a BANK_ACCOUNT of another sender profile than the request's is { ok: false }", async () => {
      const { user, actor } = await freelancer();
      const wanted = await createSenderProfile(prisma, user.id);
      const second = await createSenderProfile(prisma, user.id);
      const acc = await createBankAccount(prisma, second.id, { currency: 'USD' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'BANK_ACCOUNT',
        options: [opt(0, { bankAccountId: acc.id })],
        request: { customer: 'Acme', currency: 'USD', senderProfileId: wanted.id },
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-13: an archived PRODUCT is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const p = await createProduct(prisma, user.id, { currency: 'USD' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'PRODUCT',
        lineIndex: 0,
        options: [opt(0, { productId: p.id })],
      });
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false },
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it("AC-13: a PRODUCT priced in another currency than the request's is { ok: false }", async () => {
      const { user, actor } = await freelancer();
      const p = await createProduct(prisma, user.id, { currency: 'EUR' });
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'PRODUCT',
        lineIndex: 0,
        options: [opt(0, { productId: p.id })],
        request: { customer: 'Acme', currency: 'USD' },
      });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-13: a SENDER_PROFILE deleted since is { ok: false }', async () => {
      const { user, actor } = await freelancer();
      const sp = await createSenderProfile(prisma, user.id);
      const { conversation, offer } = await offerFor(user.id, {
        kind: 'SENDER_PROFILE',
        options: [opt(0, { senderProfileId: sp.id })],
      });
      await prisma.senderProfile.delete({ where: { id: sp.id } });

      expect(await check(actor, conversation.id, offer.id)).toEqual({ ok: false });
    });

    it('AC-12b: checkChoice changes no row, ok or not', async () => {
      const { user, actor } = await freelancer();
      const c = await createCustomer(prisma, user.id);
      const { conversation, offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: c.id })],
      });
      await createMessageAllowanceDay(prisma, {
        userId: user.id,
        day: allowanceDay(new Date()),
        used: 4,
        timeZone: TZ,
      });
      const snap = async () => ({
        offers: await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } }),
        days: await prisma.messageAllowanceDay.findMany({
          orderBy: { day: 'asc' },
        }),
      });
      const before = await snap();

      await check(actor, conversation.id, offer.id);
      await check(actor, conversation.id, offer.id, 7);
      await check(actor, conversation.id, 'offer_missing');

      expect(await snap()).toEqual(before);
    });

    // ---- claim / release -------------------------------------------------------------------------------------------

    it('AC-11: claimOffer moves OPEN to CHOSEN once; a second claim is false', async () => {
      const { user, actor } = await freelancer();
      const { offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' }), opt(1, { customerId: 'y' })],
      });

      const first = await prisma.$transaction((tx) =>
        svc.claimOffer(tx, actor, offer.id, 1)
      );
      const second = await prisma.$transaction((tx) =>
        svc.claimOffer(tx, actor, offer.id, 0)
      );

      expect([first, second]).toEqual([true, false]);
      expect(await offerRow(offer.id)).toMatchObject({
        state: 'CHOSEN',
        chosenOptionId: 1,
      });
    });

    it("AC-12b: claimOffer is false for another Freelancer's offer and changes nothing", async () => {
      const { actor } = await freelancer('t12-a@example.com');
      const other = await createFreelancer(prisma, {
        email: 't12-b@example.com',
        timeZone: TZ,
      });
      const { offer } = await offerFor(other.id, {
        options: [opt(0, { customerId: 'x' })],
      });

      const claimed = await prisma.$transaction((tx) =>
        svc.claimOffer(tx, actor, offer.id, 0)
      );

      expect(claimed).toBe(false);
      expect(await offerRow(offer.id)).toMatchObject({
        state: 'OPEN',
        chosenOptionId: null,
      });
    });

    it('AC-11: releaseOffer moves CHOSEN back to OPEN with no chosen option', async () => {
      const { user } = await freelancer();
      const { offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' })],
        state: 'CHOSEN',
        chosenOptionId: 0,
      });

      await prisma.$transaction((tx) => svc.releaseOffer(tx, offer.id));

      expect(await offerRow(offer.id)).toMatchObject({
        state: 'OPEN',
        chosenOptionId: null,
      });
    });

    it('AC-11: releaseOffer on an OPEN or CLOSED offer is a no-op', async () => {
      const { user } = await freelancer();
      const open = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' })],
      });
      const closed = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' })],
        state: 'CLOSED',
      });

      await prisma.$transaction(async (tx) => {
        await svc.releaseOffer(tx, open.offer.id);
        await svc.releaseOffer(tx, closed.offer.id);
      });

      expect(await offerRow(open.offer.id)).toMatchObject({ state: 'OPEN' });
      expect(await offerRow(closed.offer.id)).toMatchObject({
        state: 'CLOSED',
        chosenOptionId: null,
      });
    });

    // ---- reserve and claim -----------------------------------------------------------------------------------------

    const usedOf = async (userId: string) =>
      (await prisma.messageAllowanceDay.findFirstOrThrow({ where: { userId } }))
        .used;

    it('AC-11: with one message left the press takes the slot and claims the offer; the next reply is turned down', async () => {
      const { user, actor } = await freelancer();
      const now = new Date();
      await createMessageAllowanceDay(prisma, {
        userId: user.id,
        day: allowanceDay(now),
        used: 29,
        timeZone: TZ,
      });
      const first = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' }), opt(1, { customerId: 'y' })],
      });

      const r1 = await svc.reserveAndClaim(actor, now, first.offer.id, 1);

      expect(r1.ok).toBe(true);
      expect(r1.ok && r1.state.used).toBe(30);
      expect(await usedOf(user.id)).toBe(30);
      expect(await offerRow(first.offer.id)).toMatchObject({
        state: 'CHOSEN',
        chosenOptionId: 1,
      });

      const second = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' })],
      });
      const r2 = await svc.reserveAndClaim(actor, now, second.offer.id, 0);

      expect(r2).toMatchObject({ ok: false, usedUp: { kind: 'ALLOWANCE_USED_UP' } });
      expect(await offerRow(second.offer.id)).toMatchObject({
        state: 'OPEN',
        chosenOptionId: null,
      });
      expect(await usedOf(user.id)).toBe(30);
    });

    it('AC-11: two simultaneous presses of the same offer: exactly one wins, the loser takes no slot', async () => {
      const { user, actor } = await freelancer();
      const now = new Date();
      await createMessageAllowanceDay(prisma, {
        userId: user.id,
        day: allowanceDay(now),
        used: 5,
        timeZone: TZ,
      });
      const { offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' }), opt(1, { customerId: 'y' })],
      });

      const results = await Promise.all([
        svc.reserveAndClaim(actor, now, offer.id, 0),
        svc.reserveAndClaim(actor, now, offer.id, 1),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([
        { ok: false, claimLost: true },
      ]);
      expect(await usedOf(user.id)).toBe(6);
      expect((await offerRow(offer.id)).state).toBe('CHOSEN');
    });

    it('AC-11: release() of a successful reserve-and-claim gives the slot back and reopens the offer', async () => {
      const { user, actor } = await freelancer();
      const now = new Date();
      await createMessageAllowanceDay(prisma, {
        userId: user.id,
        day: allowanceDay(now),
        used: 7,
        timeZone: TZ,
      });
      const { offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' })],
      });
      const r = await svc.reserveAndClaim(actor, now, offer.id, 0);
      if (!r.ok || !('release' in r)) throw new Error('expected ok');
      expect(await usedOf(user.id)).toBe(8);

      const after = await r.release();

      expect(after.used).toBe(7);
      expect(await usedOf(user.id)).toBe(7);
      expect(await offerRow(offer.id)).toMatchObject({
        state: 'OPEN',
        chosenOptionId: null,
      });
    });

    // Review 2026-10-13 R1-B2: a typed turn in another tab saved its own OPEN offer while the press ran. The release
    // must still give the slot back, and the claimed offer ends CLOSED (unmarked) instead of breaking the
    // one-open-offer index and rolling the whole release back.
    it('AC-11, AC-12: release() after a newer OPEN offer was saved gives the slot back and closes the claimed offer', async () => {
      const { user, actor } = await freelancer();
      const now = new Date();
      await createMessageAllowanceDay(prisma, {
        userId: user.id,
        day: allowanceDay(now),
        used: 7,
        timeZone: TZ,
      });
      const { conversation, offer } = await offerFor(user.id, {
        options: [opt(0, { customerId: 'x' })],
      });
      const r = await svc.reserveAndClaim(actor, now, offer.id, 0);
      if (!r.ok || !('release' in r)) throw new Error('expected ok');
      const newer = await createChoiceOffer(prisma, {
        userId: user.id,
        conversationId: conversation.id,
        messageId: (await prisma.conversationMessage.create({
          data: { conversationId: conversation.id, position: 99, role: 'ASSISTANT', parts: [] },
        })).id,
        options: [opt(0, { customerId: 'y' })],
      });

      const after = await r.release();

      expect(after.used).toBe(7);
      expect(await usedOf(user.id)).toBe(7);
      expect(await offerRow(offer.id)).toMatchObject({ state: 'CLOSED', chosenOptionId: null });
      expect(await offerRow(newer.id)).toMatchObject({ state: 'OPEN' });
    });
  }
);
