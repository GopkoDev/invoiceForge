// T16 (ai-assistant; spec.md §5 AC-12, AC-16, AC-16b, AC-19, AC-22) - resolveDraftRequest composes the
// parties (T07) and the lines: every proposal value carries a source (REQUEST, CUSTOM_PRICE,
// CATALOGUE or DEFAULT), words win over catalogue and custom prices, a product in another currency
// is not linked, and anything missing becomes an issue - never a value of its own. Lives under
// tests/integration because the resolver reads the Freelancer's rows (the DoD names tests/contract,
// which has no database).
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
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';

type Issue = { kind: string; [k: string]: unknown };
type Line = {
  name: string;
  productId: string | null;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  quantitySource: string;
  unitSource: string;
  rateSource: string;
  agreedCustomPrice?: string | null;
};
type Proposal = {
  customer: { customerId: string; source: string };
  senderProfile: { source: string };
  bankAccount: { source: string; currency: string };
  currency: string;
  issueDate: { value: string; source: string };
  dueDate: { value: string; source: string };
  lines: Line[];
  subtotal: string;
  total: string;
  invoiceNumber?: string | null;
  defaultsUsed: string[];
};
type Outcome =
  | { success: true; data: { kind: 'PROPOSAL'; proposal: Proposal } | { kind: 'ISSUES'; issues: Issue[] } }
  | { success: false; code: string };
type Svc = {
  resolveDraftRequest: (actor: unknown, request: unknown, today: string) => Promise<Outcome>;
};

describe.runIf(containerRuntimeAvailable)('resolveDraftRequest (T16)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let schema: { draftProposalSchema: { safeParse: (v: unknown) => { success: boolean } } };

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/resolve')) as unknown as Svc;
    schema = (await import('@/lib/services/assistant-drafts/schema')) as unknown as typeof schema;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  // A Freelancer with a USD default account and a customer Acme Corp.
  async function setup() {
    const user = await createFreelancer(prisma, { email: 't16-a@example.com', timeZone: TZ });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'USD' });
    const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    return { user, acme, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  async function resolve(actor: unknown, request: Record<string, unknown>): Promise<Outcome> {
    return svc.resolveDraftRequest(actor, { customer: 'Acme', ...request }, TODAY);
  }

  async function proposalOf(p: Promise<Outcome>): Promise<Proposal> {
    const res = await p;
    if (!res.success) throw new Error(`failure ${res.code}`);
    if (res.data.kind !== 'PROPOSAL') throw new Error(JSON.stringify(res.data.issues));
    expect(schema.draftProposalSchema.safeParse(res.data.proposal).success).toBe(true);
    return res.data.proposal;
  }

  async function issuesOf(p: Promise<Outcome>): Promise<Issue[]> {
    const res = await p;
    if (!res.success) throw new Error(`failure ${res.code}`);
    expect(res.data.kind).toBe('ISSUES');
    if (res.data.kind !== 'ISSUES') throw new Error('expected issues');
    return res.data.issues;
  }

  it('AC-12: 20 hours at 50 USD is one line, 1000.00, named defaults, number left to creation', async () => {
    const { actor, acme } = await setup();

    const p = await proposalOf(
      resolve(actor, { lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }] })
    );

    expect(p.customer).toMatchObject({ customerId: acme.id, source: 'REQUEST' });
    expect(p.currency).toBe('USD');
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({
      name: 'consulting',
      productId: null,
      quantity: '20.00',
      unit: 'hours',
      rate: '50.00',
      amount: '1000.00',
      quantitySource: 'REQUEST',
      unitSource: 'REQUEST',
      rateSource: 'REQUEST',
    });
    expect(p.subtotal).toBe('1000.00');
    expect(p.total).toBe('1000.00');
    expect(p.issueDate).toEqual({ value: '2026-03-15', source: 'DEFAULT' });
    expect(p.dueDate).toEqual({ value: '2026-04-14', source: 'DEFAULT' });
    expect(p.invoiceNumber ?? null).toBeNull();
    expect(p.defaultsUsed).toEqual(
      expect.arrayContaining(['senderProfile', 'bankAccount', 'issueDate', 'dueDate'])
    );
    // the line values all came from the request: no line path is a default
    expect(p.defaultsUsed.filter((f) => f.startsWith('lines'))).toEqual([]);
  });

  it('AC-19: "600 EUR for the logo design" gets quantity 1 and unit "item", both named as defaults', async () => {
    const { user, actor } = await setup();
    const profile = await prisma.senderProfile.findFirstOrThrow({ where: { userId: user.id } });
    await createBankAccount(prisma, profile.id, { currency: 'EUR' });

    const p = await proposalOf(
      resolve(actor, { currency: 'EUR', lines: [{ description: 'logo design', price: '600' }] })
    );

    expect(p.currency).toBe('EUR');
    expect(p.lines[0]).toMatchObject({
      quantity: '1.00',
      unit: 'item',
      rate: '600.00',
      amount: '600.00',
      quantitySource: 'DEFAULT',
      unitSource: 'DEFAULT',
      rateSource: 'REQUEST',
    });
    expect(p.total).toBe('600.00');
    expect(p.defaultsUsed.some((f) => /^lines.*0.*quantity$/.test(f))).toBe(true);
    expect(p.defaultsUsed.some((f) => /^lines.*0.*unit$/.test(f))).toBe(true);
  });

  describe('AC-16 catalogue and custom prices', () => {
    it('a named product with no price uses the Customer\'s custom price, linked, with its source', async () => {
      const { user, acme, actor } = await setup();
      const product = await createProduct(prisma, user.id, {
        name: 'Consulting',
        price: 50,
        currency: 'USD',
        unit: 'hour',
      });
      await createCustomPrice(prisma, product.id, acme.id, { price: 45 });

      const p = await proposalOf(
        resolve(actor, { lines: [{ description: 'consulting', quantity: '20' }] })
      );

      expect(p.lines[0]).toMatchObject({
        productId: product.id,
        quantity: '20.00',
        unit: 'hour',
        unitSource: 'CATALOGUE',
        rate: '45.00',
        rateSource: 'CUSTOM_PRICE',
        amount: '900.00',
      });
      expect(p.total).toBe('900.00');
    });

    it('with no custom price the catalogue price is used, source CATALOGUE', async () => {
      const { user, actor } = await setup();
      const product = await createProduct(prisma, user.id, { name: 'Consulting', price: 50, currency: 'USD' });

      const p = await proposalOf(
        resolve(actor, { lines: [{ description: 'consulting', quantity: '2' }] })
      );

      expect(p.lines[0]).toMatchObject({
        productId: product.id,
        rate: '50.00',
        rateSource: 'CATALOGUE',
        amount: '100.00',
      });
    });

    it('another Customer\'s custom price is not used', async () => {
      const { user, actor } = await setup();
      const other = await createCustomer(prisma, user.id, { name: 'Initech' });
      const product = await createProduct(prisma, user.id, { name: 'Consulting', price: 50, currency: 'USD' });
      await createCustomPrice(prisma, product.id, other.id, { price: 10 });

      const p = await proposalOf(
        resolve(actor, { lines: [{ description: 'consulting', quantity: '1' }] })
      );

      expect(p.lines[0]).toMatchObject({ rate: '50.00', rateSource: 'CATALOGUE' });
    });

    it('product matching ignores case and matches by containing the written word', async () => {
      const { user, actor } = await setup();
      const product = await createProduct(prisma, user.id, {
        name: 'Senior Consulting Hour',
        price: 70,
        currency: 'USD',
      });

      const p = await proposalOf(
        resolve(actor, { lines: [{ description: 'CONSULTING', quantity: '1' }] })
      );

      expect(p.lines[0].productId).toBe(product.id);
    });

    it('a product of another Freelancer is not matched', async () => {
      const { actor } = await setup();
      const b = await createFreelancer(prisma, { email: 't16-b@example.com' });
      await createProduct(prisma, b.id, { name: 'Consulting', price: 50, currency: 'USD' });

      const issues = await issuesOf(resolve(actor, { lines: [{ description: 'consulting' }] }));

      expect(issues.map((i) => i.kind)).toEqual(['LINE_AMOUNT_MISSING']);
    });
  });

  describe('AC-16b words win and currency', () => {
    it('"at $60": the named price wins, the line stays linked, the custom price is shown beside it', async () => {
      const { user, acme, actor } = await setup();
      const product = await createProduct(prisma, user.id, { name: 'Consulting', price: 50, currency: 'USD' });
      await createCustomPrice(prisma, product.id, acme.id, { price: 45 });

      const p = await proposalOf(
        resolve(actor, {
          currency: '$',
          lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '60' }],
        })
      );

      expect(p.lines[0]).toMatchObject({
        productId: product.id,
        rate: '60.00',
        rateSource: 'REQUEST',
        agreedCustomPrice: '45.00',
        amount: '1200.00',
      });
      expect(p.total).toBe('1200.00');
    });

    it('"in EUR": the USD product is not linked and the EUR price is asked for', async () => {
      const { user, acme, actor } = await setup();
      const profile = await prisma.senderProfile.findFirstOrThrow({ where: { userId: user.id } });
      await createBankAccount(prisma, profile.id, { currency: 'EUR' });
      const product = await createProduct(prisma, user.id, { name: 'Consulting', price: 50, currency: 'USD' });
      await createCustomPrice(prisma, product.id, acme.id, { price: 45 });

      const issues = await issuesOf(
        resolve(actor, { currency: 'EUR', lines: [{ description: 'consulting', quantity: '20' }] })
      );

      expect(issues).toEqual([{ kind: 'LINE_PRICE_MISSING_IN_CURRENCY', lineIndex: 0, currency: 'EUR' }]);
    });

    it('"in EUR" with a named price: free text, not linked, the USD prices unused', async () => {
      const { user, acme, actor } = await setup();
      const profile = await prisma.senderProfile.findFirstOrThrow({ where: { userId: user.id } });
      await createBankAccount(prisma, profile.id, { currency: 'EUR' });
      const product = await createProduct(prisma, user.id, { name: 'Consulting', price: 50, currency: 'USD' });
      await createCustomPrice(prisma, product.id, acme.id, { price: 45 });

      const p = await proposalOf(
        resolve(actor, {
          currency: 'EUR',
          lines: [{ description: 'consulting', quantity: '20', price: '55' }],
        })
      );

      expect(p.lines[0]).toMatchObject({ productId: null, rate: '55.00', rateSource: 'REQUEST' });
      expect(p.lines[0].agreedCustomPrice ?? null).toBeNull();
    });
  });

  describe('AC-22 missing amounts', () => {
    it('"the website" with no product: LINE_AMOUNT_MISSING, nothing filled in', async () => {
      const { actor } = await setup();

      const issues = await issuesOf(resolve(actor, { lines: [{ description: 'the website' }] }));

      expect(issues).toEqual([{ kind: 'LINE_AMOUNT_MISSING', lineIndex: 0, description: 'the website' }]);
    });

    it('a quantity without a price and no product is still LINE_AMOUNT_MISSING', async () => {
      const { actor } = await setup();

      const issues = await issuesOf(
        resolve(actor, { lines: [{ description: 'the website', quantity: '3' }] })
      );

      expect(issues.map((i) => i.kind)).toEqual(['LINE_AMOUNT_MISSING']);
    });

    it('only the offending line is reported, with its index', async () => {
      const { actor } = await setup();

      const issues = await issuesOf(
        resolve(actor, {
          lines: [{ description: 'logo', price: '600' }, { description: 'the website' }],
        })
      );

      expect(issues).toEqual([{ kind: 'LINE_AMOUNT_MISSING', lineIndex: 1, description: 'the website' }]);
    });

    it('several products matching the line word is a question, never a pick', async () => {
      const { user, actor } = await setup();
      await createProduct(prisma, user.id, { name: 'Consulting basic', price: 50, currency: 'USD' });
      await createProduct(prisma, user.id, { name: 'Consulting premium', price: 90, currency: 'USD' });

      const res = await resolve(actor, { lines: [{ description: 'consulting', quantity: '1' }] });

      expect(res.success && res.data.kind).toBe('ISSUES');
    });
  });

  it('parties issues and line issues come back together in one list', async () => {
    const { actor } = await setup();

    const issues = await issuesOf(
      resolve(actor, { customer: 'Globex', lines: [{ description: 'the website' }] })
    );

    expect(issues.map((i) => i.kind)).toEqual(['CUSTOMER_NOT_FOUND', 'LINE_AMOUNT_MISSING']);
  });

  it('sweep: every proposal value carries a source and the total equals the subtotal', async () => {
    const { user, acme, actor } = await setup();
    const product = await createProduct(prisma, user.id, { name: 'Consulting', price: 50, currency: 'USD' });
    await createCustomPrice(prisma, product.id, acme.id, { price: 45 });

    const p = await proposalOf(
      resolve(actor, {
        lines: [
          { description: 'consulting', quantity: '20' },
          { description: 'logo', price: '600' },
          { description: 'hosting', quantity: '2.5', unit: 'months', price: '10.10' },
        ],
      })
    );

    for (const l of p.lines) {
      expect(['REQUEST', 'DEFAULT']).toContain(l.quantitySource);
      expect(['REQUEST', 'CATALOGUE', 'DEFAULT']).toContain(l.unitSource);
      expect(['REQUEST', 'CUSTOM_PRICE', 'CATALOGUE']).toContain(l.rateSource);
    }
    expect(p.lines.map((l) => l.amount)).toEqual(['900.00', '600.00', '25.25']);
    expect(p.subtotal).toBe('1525.25');
    expect(p.total).toBe(p.subtotal);
    for (const s of [p.customer.source, p.senderProfile.source, p.bankAccount.source, p.issueDate.source, p.dueDate.source]) {
      expect(['REQUEST', 'DEFAULT']).toContain(s);
    }
  });

  it('is pure apart from reads: no Draft invoice and no Customer is created', async () => {
    const { actor } = await setup();
    const before = { invoices: await prisma.invoice.count(), customers: await prisma.customer.count() };

    await resolve(actor, { lines: [{ description: 'logo', price: '600' }] });

    expect(await prisma.invoice.count()).toBe(before.invoices);
    expect(await prisma.customer.count()).toBe(before.customers);
  });
});
