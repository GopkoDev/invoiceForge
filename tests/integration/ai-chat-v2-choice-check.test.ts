// ai-chat-v2 T12 / T56 / T57 (spec.md §5 AC-11, AC-12b, AC-13; sad.md §5 Form check): the server-side gate for a sent
// form. checkForm is read-only; claimForm / releaseForm move OPEN <-> CHOSEN; reserveAndClaimForm takes the allowance
// slot and claims the form in ONE transaction. The T12 press cases were rewritten for forms (checkChoice is gone).
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
import { createQuestionForm } from '../support/factories/choice-offer';
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
type Reserve =
  | { ok: true; state: { used: number }; release: () => Promise<{ used: number }> }
  | { ok: false; usedUp: { kind: string } }
  | { ok: false; claimLost: true }
  | { ok: false; unavailable: true };
type FormAnswer = { questionId: number; optionId: number } | { questionId: number; text: string } | { questionId: number; skipped: true };
type FormCheck =
  | { ok: true; form: { id: string; request: unknown; questions: unknown }; answers: FormAnswer[] }
  | { ok: false; kind: 'UNAVAILABLE' }
  | { ok: false; kind: 'INVALID'; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: 'FAILED' };
type FormSvc = {
  checkForm: (actor: Actor, input: { conversationId: string; form: { formId: string; answers: FormAnswer[] } }) => Promise<FormCheck>;
  claimForm: (tx: Tx, actor: Actor, formId: string, answers: FormAnswer[]) => Promise<boolean>;
  releaseForm: (tx: Tx, formId: string) => Promise<void>;
  reserveAndClaimForm: (actor: Actor, now: Date, formId: string, answers: FormAnswer[]) => Promise<Reserve>;
};
describe.runIf(containerRuntimeAvailable)(
  'Checking, claiming and releasing a sent form (T12 press rules, rewritten for forms in T56/T57)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let formSvc: FormSvc;
    let allowanceDay: (now: Date) => Date;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      formSvc = (await import(
        '@/lib/services/assistant-drafts/forms'
      )) as unknown as FormSvc;
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

    const opt = (optionId: number, ref: Ref): Option => ({
      optionId,
      label: `Option ${optionId}`,
      ref,
    });

    // ---- T56: the same rules for forms ------------------------------------------------------------------------------
    // T57: the T12 press cases (checkChoice / claimOffer / releaseOffer / reserveAndClaim) were deleted with the press
    // path; every one has its form counterpart here: checkForm / claimForm / releaseForm / reserveAndClaimForm.
    describe('T56: the same rules for forms', () => {
      const UNAVAILABLE = { ok: false, kind: 'UNAVAILABLE' } as const;
      const pick = (optionId = 0): FormAnswer[] => [{ questionId: 0, optionId }];

      async function formOf(
        userId: string,
        opts: {
          field?: 'CUSTOMER' | 'SENDER_PROFILE' | 'PRODUCT' | 'BANK_ACCOUNT' | 'CURRENCY';
          options: Option[];
          request?: Record<string, unknown>;
          state?: 'OPEN' | 'CHOSEN' | 'CLOSED';
          lineIndex?: number | null;
          answers?: FormAnswer[] | null;
        }
      ) {
        const messageId = createId();
        const formId = createId();
        const field = opts.field ?? 'CUSTOMER';
        const conversation = await createConversation(prisma, {
          userId,
          messages: [
            { role: 'USER' },
            {
              role: 'ASSISTANT',
              id: messageId,
              parts: [
                { type: 'text', text: 'Which one?' },
                { type: 'data-offer', id: formId, data: { offerId: formId } },
              ],
            },
          ],
        });
        const form = await createQuestionForm(prisma, {
          id: formId,
          userId,
          conversationId: conversation.id,
          messageId,
          questions: [
            {
              questionId: 0,
              field,
              lineIndex: field === 'PRODUCT' ? (opts.lineIndex ?? 0) : null,
              heading: 'Question',
              prompt: null,
              options: opts.options,
              input: 'TEXT',
              required: true,
              skippable: false,
              matchCount: null,
              source: 'RESOLVER',
            },
          ],
          request: (opts.request ?? { customer: 'Acme', currency: 'USD', lines: [{ description: 'Design', quantity: '1' }] }) as never,
          state: opts.state,
          answers: opts.answers as never,
        });
        return { conversation, form };
      }

      const checkF = (actor: Actor, conversationId: string, formId: string, answers: FormAnswer[] = pick()) =>
        formSvc.checkForm(actor, { conversationId, form: { formId, answers } });
      const formRow = (id: string) => prisma.choiceOffer.findUniqueOrThrow({ where: { id } });

      it('AC-12b: a valid CUSTOMER press is ok with the stored request, the questions and the answers', async () => {
        const { user, actor } = await freelancer();
        const c = await createCustomer(prisma, user.id);
        const request = { customer: 'Acme', currency: 'USD', lines: [] };
        const { conversation, form } = await formOf(user.id, { options: [opt(0, { customerId: c.id })], request });

        const r = await checkF(actor, conversation.id, form.id);

        expect(r).toEqual({
          ok: true,
          form: { id: form.id, request, questions: form.questions },
          answers: pick(),
        });
      });

      it('AC-12b: valid BANK_ACCOUNT, PRODUCT, SENDER_PROFILE and CURRENCY presses are ok', async () => {
        const { user, actor } = await freelancer();
        const sp = await createSenderProfile(prisma, user.id);
        const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
        const p = await createProduct(prisma, user.id, { currency: 'USD' });
        const bank = await formOf(user.id, {
          field: 'BANK_ACCOUNT',
          options: [opt(0, { bankAccountId: acc.id })],
          request: { customer: 'Acme', currency: 'USD', senderProfileId: sp.id },
        });
        expect((await checkF(actor, bank.conversation.id, bank.form.id)).ok).toBe(true);
        const product = await formOf(user.id, { field: 'PRODUCT', options: [opt(0, { productId: p.id })] });
        expect((await checkF(actor, product.conversation.id, product.form.id)).ok).toBe(true);
        const profile = await formOf(user.id, { field: 'SENDER_PROFILE', options: [opt(0, { senderProfileId: sp.id })] });
        expect((await checkF(actor, profile.conversation.id, profile.form.id)).ok).toBe(true);
        const currency = await formOf(user.id, {
          field: 'CURRENCY',
          options: [opt(0, { currency: 'EUR' }), opt(1, { currency: 'USD' })],
        });
        expect((await checkF(actor, currency.conversation.id, currency.form.id, pick(1))).ok).toBe(true);
      });

      it.each([
        ['$', 'USD'],
        ['dollars', 'USD'],
        ['usd', 'USD'],
      ])('AC-08b: a BANK_ACCOUNT press with the currency written as "%s" fits a %s account', async (written, code) => {
        const { user, actor } = await freelancer();
        const sp = await createSenderProfile(prisma, user.id);
        const acc = await createBankAccount(prisma, sp.id, { currency: code as 'USD' });
        const { conversation, form } = await formOf(user.id, {
          field: 'BANK_ACCOUNT',
          options: [opt(0, { bankAccountId: acc.id })],
          request: { customer: 'Acme', currency: written, senderProfileId: sp.id },
        });

        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
      });

      it('AC-13 (T70): a BANK_ACCOUNT press is ACCEPTED when the account is unchanged, even if the request wrote "€" (the resolver judges the fit after Send)', async () => {
        const { user, actor } = await freelancer();
        const sp = await createSenderProfile(prisma, user.id);
        const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
        const { conversation, form } = await formOf(user.id, {
          field: 'BANK_ACCOUNT',
          options: [opt(0, { bankAccountId: acc.id, accountCurrency: 'USD' })],
          request: { customer: 'Acme', currency: '€' },
        });

        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
      });

      it('AC-13: (T70) a BANK_ACCOUNT of a profile named in the request stays ACCEPTED after that profile is renamed, the account itself being unchanged', async () => {
        const { user, actor } = await freelancer();
        const consulting = await createSenderProfile(prisma, user.id, { name: 'Consulting FOP', isDefault: false });
        await createSenderProfile(prisma, user.id, { name: 'Main', isDefault: true });
        const acc = await createBankAccount(prisma, consulting.id, { currency: 'USD' });
        const { conversation, form } = await formOf(user.id, {
          field: 'BANK_ACCOUNT',
          options: [opt(0, { bankAccountId: acc.id, accountCurrency: 'USD' })],
          request: { customer: 'Acme', currency: 'USD', senderProfile: 'consulting  fop' },
        });
        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
        await prisma.senderProfile.update({ where: { id: consulting.id }, data: { name: 'Studio' } });

        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
      });

      // Review 2026-10-13 R13-2: a request with no currency drafts in the default account's currency. Once that moves to
      // another currency, a product priced in the old one no longer fits.
      it('AC-13: (T70) a PRODUCT for a request with no currency stays ACCEPTED once the default account is in another currency, the product being unchanged', async () => {
        const { user, actor } = await freelancer();
        const sp = await createSenderProfile(prisma, user.id, { name: 'Main', isDefault: true });
        const usd = await createBankAccount(prisma, sp.id, { currency: 'USD', isDefault: true });
        const eur = await createBankAccount(prisma, sp.id, { currency: 'EUR', isDefault: false });
        const p = await createProduct(prisma, user.id, { currency: 'USD' });
        const { conversation, form } = await formOf(user.id, {
          field: 'PRODUCT',
          lineIndex: 0,
          options: [opt(0, { productId: p.id })],
          request: { customer: 'Acme', lines: [{ description: 'Audit', quantity: '1' }] },
        });
        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
        await prisma.bankAccount.update({ where: { id: usd.id }, data: { isDefault: false } });
        await prisma.bankAccount.update({ where: { id: eur.id }, data: { isDefault: true } });

        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
      });

      it('AC-08b: a PRODUCT press with the currency written as "€" fits a EUR product', async () => {
        const { user, actor } = await freelancer();
        const p = await createProduct(prisma, user.id, { currency: 'EUR' });
        const { conversation, form } = await formOf(user.id, {
          field: 'PRODUCT',
          lineIndex: 0,
          options: [opt(0, { productId: p.id })],
          request: { customer: 'Acme', currency: '€', lines: [{ description: 'Audit', quantity: '1' }] },
        });

        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
      });

      it('AC-12b: an unknown form id and another Freelancer\'s form (and my form naming their Customer) are the same result', async () => {
        const { user, actor } = await freelancer('t12-a@example.com');
        const other = await createFreelancer(prisma, { email: 't12-b@example.com', timeZone: TZ });
        const theirs = await createCustomer(prisma, other.id);
        const mine = await formOf(user.id, { options: [opt(0, { customerId: theirs.id })] });
        const foreign = await formOf(other.id, { options: [opt(0, { customerId: theirs.id })] });

        const unknown = await checkF(actor, mine.conversation.id, 'form_missing');
        expect(unknown).toStrictEqual(UNAVAILABLE);
        expect(await checkF(actor, foreign.conversation.id, foreign.form.id)).toStrictEqual(unknown);
        expect(await checkF(actor, mine.conversation.id, mine.form.id)).toStrictEqual(unknown);
      });

      it('AC-12b: a form of another Conversation of the same Freelancer, a CLOSED form, a CHOSEN form and an option not held are UNAVAILABLE', async () => {
        const { user, actor } = await freelancer();
        const c = await createCustomer(prisma, user.id);
        const options = [opt(0, { customerId: c.id })];
        const open = await formOf(user.id, { options });
        const elsewhere = await createConversation(prisma, {
          userId: user.id,
          messages: [{ role: 'USER' }, { role: 'ASSISTANT' }],
        });
        const closed = await formOf(user.id, { options, state: 'CLOSED' });
        const chosen = await formOf(user.id, { options, state: 'CHOSEN', answers: pick() });

        expect(await checkF(actor, elsewhere.id, open.form.id)).toStrictEqual(UNAVAILABLE);
        expect(await checkF(actor, closed.conversation.id, closed.form.id)).toStrictEqual(UNAVAILABLE);
        expect(await checkF(actor, chosen.conversation.id, chosen.form.id)).toStrictEqual(UNAVAILABLE);
        expect(await checkF(actor, open.conversation.id, open.form.id, pick(5))).toStrictEqual(UNAVAILABLE);
      });

      it('AC-13: a CUSTOMER, BANK_ACCOUNT or SENDER_PROFILE deleted since is UNAVAILABLE', async () => {
        const { user, actor } = await freelancer();
        const c = await createCustomer(prisma, user.id);
        const sp = await createSenderProfile(prisma, user.id);
        const acc = await createBankAccount(prisma, sp.id, { currency: 'USD' });
        const sp2 = await createSenderProfile(prisma, user.id);
        const customer = await formOf(user.id, { options: [opt(0, { customerId: c.id })] });
        const bank = await formOf(user.id, { field: 'BANK_ACCOUNT', options: [opt(0, { bankAccountId: acc.id })] });
        const profile = await formOf(user.id, { field: 'SENDER_PROFILE', options: [opt(0, { senderProfileId: sp2.id })] });
        await prisma.customer.delete({ where: { id: c.id } });
        await prisma.bankAccount.delete({ where: { id: acc.id } });
        await prisma.senderProfile.delete({ where: { id: sp2.id } });

        expect(await checkF(actor, customer.conversation.id, customer.form.id)).toStrictEqual(UNAVAILABLE);
        expect(await checkF(actor, bank.conversation.id, bank.form.id)).toStrictEqual(UNAVAILABLE);
        expect(await checkF(actor, profile.conversation.id, profile.form.id)).toStrictEqual(UNAVAILABLE);
      });

      it("AC-13 (T70): a BANK_ACCOUNT whose currency changed since the form is UNAVAILABLE; one of another profile than the request's is ACCEPTED", async () => {
        const { user, actor } = await freelancer();
        const wanted = await createSenderProfile(prisma, user.id);
        const second = await createSenderProfile(prisma, user.id);
        const acc = await createBankAccount(prisma, wanted.id, { currency: 'USD' });
        const accSecond = await createBankAccount(prisma, second.id, { currency: 'USD' });
        const request = { customer: 'Acme', currency: 'USD', senderProfileId: wanted.id };
        const currency = await formOf(user.id, { field: 'BANK_ACCOUNT', options: [opt(0, { bankAccountId: acc.id, accountCurrency: 'USD' })], request });
        const profile = await formOf(user.id, { field: 'BANK_ACCOUNT', options: [opt(0, { bankAccountId: accSecond.id, accountCurrency: 'USD' })], request });
        expect((await checkF(actor, currency.conversation.id, currency.form.id)).ok).toBe(true);
        await prisma.bankAccount.update({ where: { id: acc.id }, data: { currency: 'EUR' } });

        expect(await checkF(actor, currency.conversation.id, currency.form.id)).toStrictEqual(UNAVAILABLE);
        expect((await checkF(actor, profile.conversation.id, profile.form.id)).ok).toBe(true);
      });

      it('AC-13 (T70): a BANK_ACCOUNT of the default profile stays ACCEPTED once another profile is the default, the account being unchanged', async () => {
        const { user, actor } = await freelancer();
        const main = await createSenderProfile(prisma, user.id, { name: 'Main', isDefault: true });
        const second = await createSenderProfile(prisma, user.id, { name: 'Second', isDefault: false });
        const acc = await createBankAccount(prisma, main.id, { currency: 'USD' });
        const { conversation, form } = await formOf(user.id, {
          field: 'BANK_ACCOUNT',
          options: [opt(0, { bankAccountId: acc.id, accountCurrency: 'USD' })],
          request: { customer: 'Acme', currency: 'USD' },
        });
        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
        await prisma.senderProfile.update({ where: { id: main.id }, data: { isDefault: false } });
        await prisma.senderProfile.update({ where: { id: second.id }, data: { isDefault: true } });

        expect((await checkF(actor, conversation.id, form.id)).ok).toBe(true);
      });

      it('AC-13: (T70) a PRODUCT archived is UNAVAILABLE; one priced in another currency than the request\'s is ACCEPTED', async () => {
        const { user, actor } = await freelancer();
        const archived = await createProduct(prisma, user.id, { currency: 'USD' });
        const eur = await createProduct(prisma, user.id, { currency: 'EUR' });
        const a = await formOf(user.id, { field: 'PRODUCT', options: [opt(0, { productId: archived.id })] });
        const b = await formOf(user.id, {
          field: 'PRODUCT',
          options: [opt(0, { productId: eur.id })],
          request: { customer: 'Acme', currency: 'USD', lines: [{ description: 'Audit', quantity: '1' }] },
        });
        await prisma.product.update({ where: { id: archived.id }, data: { isActive: false } });

        expect(await checkF(actor, a.conversation.id, a.form.id)).toStrictEqual(UNAVAILABLE);
        expect((await checkF(actor, b.conversation.id, b.form.id)).ok).toBe(true);
      });

      it('AC-12b: checkForm changes no row, ok or not', async () => {
        const { user, actor } = await freelancer();
        const c = await createCustomer(prisma, user.id);
        const { conversation, form } = await formOf(user.id, { options: [opt(0, { customerId: c.id })] });
        await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(new Date()), used: 4, timeZone: TZ });
        const snap = async () => ({
          forms: await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } }),
          days: await prisma.messageAllowanceDay.findMany({ orderBy: { day: 'asc' } }),
        });
        const before = await snap();

        await checkF(actor, conversation.id, form.id);
        await checkF(actor, conversation.id, form.id, pick(7));
        await checkF(actor, conversation.id, 'form_missing');

        expect(await snap()).toEqual(before);
      });

      it('AC-11: claimForm moves OPEN to CHOSEN with the answers once; a second claim is false', async () => {
        const { user, actor } = await freelancer();
        const { form } = await formOf(user.id, { options: [opt(0, { customerId: 'x' }), opt(1, { customerId: 'y' })] });

        const first = await prisma.$transaction((tx) => formSvc.claimForm(tx, actor, form.id, pick(1)));
        const second = await prisma.$transaction((tx) => formSvc.claimForm(tx, actor, form.id, pick(0)));

        expect([first, second]).toEqual([true, false]);
        expect(await formRow(form.id)).toMatchObject({ state: 'CHOSEN', answers: pick(1) });
      });

      it("AC-12b: claimForm is false for another Freelancer's form and changes nothing", async () => {
        const { actor } = await freelancer('t12-a@example.com');
        const other = await createFreelancer(prisma, { email: 't12-b@example.com', timeZone: TZ });
        const { form } = await formOf(other.id, { options: [opt(0, { customerId: 'x' })] });

        const claimed = await prisma.$transaction((tx) => formSvc.claimForm(tx, actor, form.id, pick()));

        expect(claimed).toBe(false);
        expect(await formRow(form.id)).toMatchObject({ state: 'OPEN', answers: null });
      });

      it('AC-11: releaseForm moves CHOSEN back to OPEN with no answers', async () => {
        const { user } = await freelancer();
        const { form } = await formOf(user.id, {
          options: [opt(0, { customerId: 'x' })],
          state: 'CHOSEN',
          answers: pick(),
        });

        await prisma.$transaction((tx) => formSvc.releaseForm(tx, form.id));

        expect(await formRow(form.id)).toMatchObject({ state: 'OPEN', answers: null });
      });

      it('AC-11: releaseForm on an OPEN or CLOSED form is a no-op', async () => {
        const { user } = await freelancer();
        const open = await formOf(user.id, { options: [opt(0, { customerId: 'x' })] });
        const closed = await formOf(user.id, { options: [opt(0, { customerId: 'x' })], state: 'CLOSED' });

        await prisma.$transaction(async (tx) => {
          await formSvc.releaseForm(tx, open.form.id);
          await formSvc.releaseForm(tx, closed.form.id);
        });

        expect(await formRow(open.form.id)).toMatchObject({ state: 'OPEN', answers: null });
        expect(await formRow(closed.form.id)).toMatchObject({ state: 'CLOSED', answers: null });
      });

      const usedOf = async (userId: string) => (await prisma.messageAllowanceDay.findFirstOrThrow({ where: { userId } })).used;

      it('AC-11: with one message left the Send takes the slot and claims the form; the next reply is turned down', async () => {
        const { user, actor } = await freelancer();
        const now = new Date();
        await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 29, timeZone: TZ });
        const first = await formOf(user.id, { options: [opt(0, { customerId: 'x' }), opt(1, { customerId: 'y' })] });

        const r1 = await formSvc.reserveAndClaimForm(actor, now, first.form.id, pick(1));

        expect(r1.ok).toBe(true);
        expect(r1.ok && r1.state.used).toBe(30);
        expect(await usedOf(user.id)).toBe(30);
        expect(await formRow(first.form.id)).toMatchObject({ state: 'CHOSEN', answers: pick(1) });

        const second = await formOf(user.id, { options: [opt(0, { customerId: 'x' })] });
        const r2 = await formSvc.reserveAndClaimForm(actor, now, second.form.id, pick());

        expect(r2).toMatchObject({ ok: false, usedUp: { kind: 'ALLOWANCE_USED_UP' } });
        expect(await formRow(second.form.id)).toMatchObject({ state: 'OPEN', answers: null });
        expect(await usedOf(user.id)).toBe(30);
      });

      it('AC-11: two simultaneous Sends of the same form: exactly one wins, the loser takes no slot', async () => {
        const { user, actor } = await freelancer();
        const now = new Date();
        await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 5, timeZone: TZ });
        const { form } = await formOf(user.id, { options: [opt(0, { customerId: 'x' }), opt(1, { customerId: 'y' })] });

        const results = await Promise.all([
          formSvc.reserveAndClaimForm(actor, now, form.id, pick(0)),
          formSvc.reserveAndClaimForm(actor, now, form.id, pick(1)),
        ]);

        expect(results.filter((r) => r.ok)).toHaveLength(1);
        expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, claimLost: true }]);
        expect(await usedOf(user.id)).toBe(6);
        expect((await formRow(form.id)).state).toBe('CHOSEN');
      });

      it('AC-11: release() of a successful reserve-and-claim gives the slot back and reopens the form', async () => {
        const { user, actor } = await freelancer();
        const now = new Date();
        await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 7, timeZone: TZ });
        const { form } = await formOf(user.id, { options: [opt(0, { customerId: 'x' })] });
        const r = await formSvc.reserveAndClaimForm(actor, now, form.id, pick());
        if (!r.ok || !('release' in r)) throw new Error('expected ok');
        expect(await usedOf(user.id)).toBe(8);

        const after = await r.release();

        expect(after.used).toBe(7);
        expect(await usedOf(user.id)).toBe(7);
        expect(await formRow(form.id)).toMatchObject({ state: 'OPEN', answers: null });
      });

      it('AC-11, AC-12: release() after a newer OPEN form was saved gives the slot back and closes the claimed form', async () => {
        const { user, actor } = await freelancer();
        const now = new Date();
        await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 7, timeZone: TZ });
        const { conversation, form } = await formOf(user.id, { options: [opt(0, { customerId: 'x' })] });
        const r = await formSvc.reserveAndClaimForm(actor, now, form.id, pick());
        if (!r.ok || !('release' in r)) throw new Error('expected ok');
        const messageId = (
          await prisma.conversationMessage.create({
            data: { conversationId: conversation.id, position: 99, role: 'ASSISTANT', parts: [] },
          })
        ).id;
        const newer = await createQuestionForm(prisma, { userId: user.id, conversationId: conversation.id, messageId });

        const after = await r.release();

        expect(after.used).toBe(7);
        expect(await usedOf(user.id)).toBe(7);
        expect(await formRow(form.id)).toMatchObject({ state: 'CLOSED', answers: null });
        expect(await formRow(newer.id)).toMatchObject({ state: 'OPEN' });
      });

      it('AC-12: release() after a newer message (no form) was saved gives the slot back and closes the claimed form', async () => {
        const { user, actor } = await freelancer();
        const now = new Date();
        await createMessageAllowanceDay(prisma, { userId: user.id, day: allowanceDay(now), used: 7, timeZone: TZ });
        const { conversation, form } = await formOf(user.id, { options: [opt(0, { customerId: 'x' })] });
        const r = await formSvc.reserveAndClaimForm(actor, now, form.id, pick());
        if (!r.ok || !('release' in r)) throw new Error('expected ok');
        await prisma.conversationMessage.createMany({
          data: [
            { conversationId: conversation.id, position: 50, role: 'USER', origin: 'TYPED', parts: [] },
            { conversationId: conversation.id, position: 51, role: 'ASSISTANT', parts: [] },
          ],
        });

        await r.release();

        expect(await usedOf(user.id)).toBe(7);
        expect(await formRow(form.id)).toMatchObject({ state: 'CLOSED', answers: null });
      });
    });
  }
);
