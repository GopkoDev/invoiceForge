// ai-chat-v2 T78 (sdd:fix 2026-10-14; ADR-0011 amended): the server fills an input-only record question with the
// Freelancer's OWN records (up to 8, most recently updated first, each with a `detail` line); checkAskUser's recordIds
// options carry the same detail. Request-free: the actor is built from raw values.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@/auth', () => ({ auth: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Q = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Svc = {
  fillRecordOptions?: (actor: Actor, qs: Q[], ctx: { currency?: string | null; senderProfileId?: string | null }) => Promise<Q[]>;
  checkAskUser: (actor: Actor, raw: unknown, ctx: { today: string }) => Promise<{ ok: boolean; questions?: Q[] }>;
};

const emptyQ = (field: string, over: Q = {}): Q => ({
  questionId: 0, field, lineIndex: null, heading: field, prompt: null, options: [], input: 'TEXT',
  required: true, skippable: false, matchCount: null, source: 'CHAT', ...over,
});

describe.runIf(containerRuntimeAvailable)('fillRecordOptions and ask_user detail (T78)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/forms')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  async function owner(email: string) {
    const user = await createFreelancer(prisma, { email, timeZone: 'Europe/Kyiv' });
    return { user, actor: await actingFreelancerForTest(user.id, 'Europe/Kyiv') };
  }
  const fill = async (actor: Actor, qs: Q[], ctx = {}) => {
    expect(svc.fillRecordOptions).toBeTypeOf('function');
    return svc.fillRecordOptions!(actor, qs, ctx);
  };

  it('10 customers: the 8 most recently updated, numbered 0..7, with email as detail; the input stays', async () => {
    const { user, actor } = await owner('t78-a@example.com');
    for (let n = 0; n < 10; n++) {
      const c = await createCustomer(prisma, user.id, { name: `Client ${n}`, email: `c${n}@x.test` });
      await prisma.customer.update({ where: { id: c.id }, data: { updatedAt: new Date(Date.UTC(2026, 0, 1 + n)) } });
    }
    const [out] = await fill(actor, [emptyQ('CUSTOMER')]);
    expect(out.options.map((o: Q) => o.label)).toEqual([9, 8, 7, 6, 5, 4, 3, 2].map((n) => `Client ${n}`));
    expect(out.options.map((o: Q) => o.optionId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(out.options[0].detail).toBe('c9@x.test');
    expect(out.options[0].ref).toEqual({ customerId: expect.any(String) });
    expect(out.input).toBe('TEXT');
  });

  it('customer detail falls back to country, then is omitted', async () => {
    const { user, actor } = await owner('t78-b@example.com');
    await createCustomer(prisma, user.id, { name: 'Has Country', email: null, country: 'Ukraine' });
    await createCustomer(prisma, user.id, { name: 'Bare', email: null, country: null });
    const [out] = await fill(actor, [emptyQ('CUSTOMER')]);
    const byLabel = Object.fromEntries(out.options.map((o: Q) => [o.label, o]));
    expect(byLabel['Has Country'].detail).toBe('Ukraine');
    expect(byLabel['Bare']).toBeDefined();
    expect('detail' in byLabel['Bare']).toBe(false);
  });

  it("another Freelancer's records never appear", async () => {
    const { actor } = await owner('t78-c@example.com');
    const other = await createFreelancer(prisma, { email: 't78-c2@example.com' });
    await createCustomer(prisma, other.id, { name: 'Foreign' });
    const [out] = await fill(actor, [emptyQ('CUSTOMER')]);
    expect(out.options).toEqual([]);
  });

  it('0 own records: the question stays input-only', async () => {
    const { actor } = await owner('t78-d@example.com');
    const [out] = await fill(actor, [emptyQ('PRODUCT')], { currency: 'USD' });
    expect(out.options).toEqual([]);
    expect(out.input).toBe('TEXT');
  });

  it('products: active only, filtered to the known currency, detail the app-formatted price', async () => {
    const { user, actor } = await owner('t78-e@example.com');
    await createProduct(prisma, user.id, { name: 'Design', price: 50, currency: 'USD' });
    await createProduct(prisma, user.id, { name: 'Euro thing', price: 10, currency: 'EUR' });
    await createProduct(prisma, user.id, { name: 'Archived', price: 5, currency: 'USD', isActive: false });
    const [out] = await fill(actor, [emptyQ('PRODUCT', { lineIndex: 0 })], { currency: 'USD' });
    expect(out.options.map((o: Q) => o.label)).toEqual([expect.stringContaining('Design')]);
    expect(out.options[0].detail).toBe('$50.00');
    const [any] = await fill(actor, [emptyQ('PRODUCT', { lineIndex: 0 })], {});
    expect(any.options).toHaveLength(2);
  });

  it('bank accounts: of the given profile and currency, detail "CUR ••last4"', async () => {
    const { user, actor } = await owner('t78-f@example.com');
    const main = await createSenderProfile(prisma, user.id, { name: 'Main' });
    const side = await createSenderProfile(prisma, user.id, { name: 'Side' });
    const usd = await createBankAccount(prisma, main.id, { currency: 'USD', accountNumber: '1111112345' });
    await createBankAccount(prisma, main.id, { currency: 'EUR', accountNumber: '2222226789' });
    await createBankAccount(prisma, side.id, { currency: 'USD', accountNumber: '3333330000' });
    const [out] = await fill(actor, [emptyQ('BANK_ACCOUNT')], { currency: 'USD', senderProfileId: main.id });
    expect(out.options).toHaveLength(1);
    expect(out.options[0].ref).toEqual({ bankAccountId: usd.id, accountCurrency: 'USD' });
    expect(out.options[0].detail).toBe('USD ••2345');
  });

  it('questions that already have options, a matchCount, or another field are untouched', async () => {
    const { user, actor } = await owner('t78-g@example.com');
    await createCustomer(prisma, user.id, { name: 'Acme' });
    const withOptions = emptyQ('CUSTOMER', { options: [{ optionId: 0, label: 'Mine', ref: { customerId: 'x' } }] });
    const counted = emptyQ('CUSTOMER', { questionId: 1, matchCount: 12 });
    const notes = emptyQ('NOTES', { questionId: 2 });
    const out = await fill(actor, [withOptions, counted, notes]);
    expect(out).toEqual([withOptions, counted, notes]);
  });

  it('checkAskUser recordIds options carry detail (customer email, product price)', async () => {
    const { user, actor } = await owner('t78-h@example.com');
    const c = await createCustomer(prisma, user.id, { name: 'Acme', email: 'a@acme.test' });
    const p = await createProduct(prisma, user.id, { name: 'Design', price: 50, currency: 'USD' });
    const res = await svc.checkAskUser(actor, {
      questions: [
        { field: 'CUSTOMER', prompt: 'Who?', recordIds: [c.id] },
        { field: 'PRODUCT', lineIndex: 0, prompt: 'Which?', recordIds: [p.id] },
      ],
    }, { today: '2026-10-14' });
    expect(res.ok).toBe(true);
    expect(res.questions![0].options[0].detail).toBe('a@acme.test');
    expect(res.questions![1].options[0].detail).toBe('$50.00');
  });
});
