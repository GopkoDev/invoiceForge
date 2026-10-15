// ai-chat-v2 T08 (AC-04, AC-10; contracts/openapi.yaml DraftRequestDelta, DraftIssueDelta): the draft resolver
// accepts senderProfileId (owner-scoped) and labels its candidates (Customer email, bank account bank name / last
// four / currency, product unit / price / currency, sender profile refs). Same resolver for the chat and MCP, so the
// refusal of "both fields" is checked through POST /api/mcp like "Give exactly one of customer and customerId.".
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createCustomer } from '../support/factories/customer';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createBankAccount } from '../support/factories/bank-account';
import { createProduct } from '../support/factories/product';
import { createCustomPrice } from '../support/factories/custom-price';
import { createPersonalKey } from '../support/factories/personal-key';
import { actingFreelancerForTest } from '../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';
const BOTH = 'Give at most one of senderProfile and senderProfileId.';
const LINE = { description: 'consulting', quantity: '10', unit: 'hours', price: '1600' };
const FULL_NUMBER = 'UA213223130000026007233566001';

type Issue = { kind: string; [k: string]: any };
type Outcome =
  | { success: true; data: { kind: 'PROPOSAL'; proposal: any } | { kind: 'ISSUES'; issues: Issue[] } }
  | { success: false; code: string; message?: string };
type Svc = { resolveDraftRequest: (actor: unknown, request: unknown, today: string) => Promise<Outcome> };

let rpcId = 0;
const post = (body: unknown, key: string) =>
  new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-real-ip': '203.0.113.9',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

describe.runIf(containerRuntimeAvailable)('resolver request and candidate delta (ai-chat-v2 T08)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let route: typeof import('@/app/api/mcp/route');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/resolve')) as unknown as Svc;
    route = await import('@/app/api/mcp/route');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  // Default profile "Studio" (USD only) and "Consulting FOP" (UAH), customer Acme Corp.
  async function setup() {
    const user = await createFreelancer(prisma, { email: 't08-a@example.com', timeZone: TZ });
    const studio = await createSenderProfile(prisma, user.id, { name: 'Studio' });
    const studioUsd = await createBankAccount(prisma, studio.id, { currency: 'USD', bankName: 'Studio Bank' });
    const fop = await createSenderProfile(prisma, user.id, { name: 'Consulting FOP' });
    const fopUah = await createBankAccount(prisma, fop.id, {
      currency: 'UAH',
      bankName: 'Mono',
      accountNumber: FULL_NUMBER,
    });
    const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'billing@acme.test' });
    return { user, studio, studioUsd, fop, fopUah, acme, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  const resolve = (actor: unknown, request: Record<string, unknown>) =>
    svc.resolveDraftRequest(actor, { customer: 'Acme Corp', lines: [LINE], ...request }, TODAY);

  async function proposalOf(p: Promise<Outcome>) {
    const res = await p;
    if (!res.success) throw new Error(`failure ${res.code}`);
    if (res.data.kind !== 'PROPOSAL') throw new Error(JSON.stringify(res.data.issues));
    return res.data.proposal;
  }
  async function issuesOf(p: Promise<Outcome>): Promise<Issue[]> {
    const res = await p;
    if (!res.success) throw new Error(`failure ${res.code}`);
    if (res.data.kind !== 'ISSUES') throw new Error(`expected issues, got ${JSON.stringify(res.data)}`);
    return res.data.issues;
  }

  describe('AC-04 draft under another sender profile', () => {
    it('by name: "Consulting FOP" and its UAH account, both taken from the request', async () => {
      const { actor, fop, fopUah } = await setup();

      const p = await proposalOf(resolve(actor, { currency: 'UAH', senderProfile: 'Consulting FOP' }));

      expect(p.senderProfile).toMatchObject({
        senderProfileId: fop.id,
        name: { freelancerText: 'Consulting FOP' },
        source: 'REQUEST',
      });
      expect(p.bankAccount).toMatchObject({ bankAccountId: fopUah.id, currency: 'UAH', source: 'REQUEST' });
      expect(p.currency).toBe('UAH');
    });

    it('by id: the same profile and account, source REQUEST', async () => {
      const { actor, fop, fopUah } = await setup();

      const p = await proposalOf(resolve(actor, { currency: 'UAH', senderProfileId: fop.id }));

      expect(p.senderProfile).toMatchObject({ senderProfileId: fop.id, source: 'REQUEST' });
      expect(p.bankAccount).toMatchObject({ bankAccountId: fopUah.id, currency: 'UAH', source: 'REQUEST' });
    });

    it('without a profile the default "Studio" is used, source DEFAULT (unchanged)', async () => {
      const { actor, studio } = await setup();

      const p = await proposalOf(resolve(actor, {}));

      expect(p.senderProfile).toMatchObject({ senderProfileId: studio.id, source: 'DEFAULT' });
    });
  });

  describe('senderProfileId is owner-scoped', () => {
    async function otherFreelancersProfile() {
      const other = await createFreelancer(prisma, { email: 't08-b@example.com', timeZone: TZ });
      const secret = await createSenderProfile(prisma, other.id, { name: 'Secret Studio Ltd' });
      await createBankAccount(prisma, secret.id, { currency: 'UAH' });
      return secret;
    }

    it("another Freelancer's id: SENDER_PROFILE_NOT_FOUND worded as a name, own refs only, nothing foreign leaks", async () => {
      const { actor, studio, fop } = await setup();
      const foreign = await otherFreelancersProfile();

      const res = await resolve(actor, { senderProfileId: foreign.id });
      const issues = await issuesOf(Promise.resolve(res));

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'SENDER_PROFILE_NOT_FOUND', written: foreign.id });
      expect([...issues[0].options].sort()).toEqual(['Consulting FOP', 'Studio']);
      expect(issues[0].profiles).toHaveLength(2);
      expect(issues[0].profiles).toEqual(
        expect.arrayContaining([
          { senderProfileId: studio.id, name: { freelancerText: 'Studio' } },
          { senderProfileId: fop.id, name: { freelancerText: 'Consulting FOP' } },
        ])
      );
      expect(JSON.stringify(res)).not.toContain('Secret Studio Ltd');
    });

    it('an unknown id answers exactly like a foreign one', async () => {
      const { actor } = await setup();
      const foreign = await otherFreelancersProfile();

      const unknown = await issuesOf(resolve(actor, { senderProfileId: 'clx0doesnotexist000000000' }));
      const foreignIssues = await issuesOf(resolve(actor, { senderProfileId: foreign.id }));

      expect(unknown[0]).toMatchObject({ kind: 'SENDER_PROFILE_NOT_FOUND', written: 'clx0doesnotexist000000000' });
      const strip = (issue: Issue) => {
        const rest: Record<string, unknown> = { ...issue };
        delete rest.written;
        return rest;
      };
      expect(strip(unknown[0])).toEqual(strip(foreignIssues[0]));
    });

    it('a profile given by a name that matches nothing also carries profiles[] beside options', async () => {
      const { actor, studio, fop } = await setup();

      const issues = await issuesOf(resolve(actor, { senderProfile: 'Nowhere' }));

      expect(issues[0]).toMatchObject({ kind: 'SENDER_PROFILE_NOT_FOUND', written: 'Nowhere' });
      expect(issues[0].profiles).toEqual(
        expect.arrayContaining([
          { senderProfileId: studio.id, name: { freelancerText: 'Studio' } },
          { senderProfileId: fop.id, name: { freelancerText: 'Consulting FOP' } },
        ])
      );
      expect(issues[0].profiles).toHaveLength(2);
    });
  });

  describe('Customer candidates carry email (AC-10)', () => {
    it('"Acme Corp" and "Аcme Corp" (Cyrillic А) both appear with their emails', async () => {
      const { user, actor } = await setup();
      await prisma.customer.deleteMany({ where: { userId: user.id } });
      const latin = await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'latin@acme.test' });
      const cyr = await createCustomer(prisma, user.id, { name: 'Аcme Corp', email: 'cyrillic@acme.test' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme Corp' }));

      expect(issues[0].kind).toBe('CUSTOMER_AMBIGUOUS');
      expect(issues[0].candidates).toHaveLength(2);
      expect(issues[0].candidates).toEqual(
        expect.arrayContaining([
          { customerId: latin.id, name: { freelancerText: 'Acme Corp' }, email: 'latin@acme.test' },
          { customerId: cyr.id, name: { freelancerText: 'Аcme Corp' }, email: 'cyrillic@acme.test' },
        ])
      );
    });

    it('a Customer with no email has email null', async () => {
      const { user, actor } = await setup();
      await createCustomer(prisma, user.id, { name: 'Acme GmbH' });
      await prisma.customer.updateMany({ where: { userId: user.id, name: 'Acme GmbH' }, data: { email: null } });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme' }));

      const gmbh = issues[0].candidates.find((c: any) => c.name.freelancerText === 'Acme GmbH');
      expect(gmbh.email).toBeNull();
      const corp = issues[0].candidates.find((c: any) => c.name.freelancerText === 'Acme Corp');
      expect(corp.email).toBe('billing@acme.test');
    });

    it('CUSTOMER_NEAR_MISS candidates carry email too', async () => {
      const { actor, acme } = await setup();

      const issues = await issuesOf(resolve(actor, { customer: 'Acmee Corp' }));

      expect(issues[0].kind).toBe('CUSTOMER_NEAR_MISS');
      expect(issues[0].candidates).toEqual([
        { customerId: acme.id, name: { freelancerText: 'Acme Corp' }, email: 'billing@acme.test' },
      ]);
    });
  });

  describe('bank-account candidates carry bank name, last four and currency, never the number', () => {
    async function twoEurAccounts() {
      const s = await setup();
      const wise = await createBankAccount(prisma, s.studio.id, {
        currency: 'EUR',
        bankName: 'Wise',
        accountNumber: 'BE68 5390 0754 7034',
      });
      const revolut = await createBankAccount(prisma, s.studio.id, {
        currency: 'EUR',
        bankName: 'Revolut',
        accountNumber: 'LT12 1000 0111 0100 1000',
      });
      return { ...s, wise, revolut };
    }
    const wiseCandidate = (id: string) => ({
      bankAccountId: id,
      label: 'Wise ••7034',
      bankName: { freelancerText: 'Wise' },
      lastFour: '7034',
      currency: 'EUR',
    });
    const revolutCandidate = (id: string) => ({
      bankAccountId: id,
      label: 'Revolut ••1000',
      bankName: { freelancerText: 'Revolut' },
      lastFour: '1000',
      currency: 'EUR',
    });

    it('SEVERAL_ACCOUNTS_IN_CURRENCY', async () => {
      const { actor, wise, revolut } = await twoEurAccounts();

      const res = await resolve(actor, { currency: 'EUR' });
      const issues = await issuesOf(Promise.resolve(res));

      expect(issues[0].kind).toBe('SEVERAL_ACCOUNTS_IN_CURRENCY');
      expect(issues[0].accounts).toHaveLength(2);
      expect(issues[0].accounts).toEqual(
        expect.arrayContaining([wiseCandidate(wise.id), revolutCandidate(revolut.id)])
      );
      const text = JSON.stringify(res);
      expect(text).not.toContain('BE68');
      expect(text).not.toContain('5390 0754');
      expect(text).not.toContain('LT12');
    });

    it('BANK_ACCOUNT_NOT_FOUND', async () => {
      const { actor, wise, revolut } = await twoEurAccounts();

      const issues = await issuesOf(resolve(actor, { currency: 'EUR', bankAccount: 'Monzo' }));

      expect(issues[0]).toMatchObject({ kind: 'BANK_ACCOUNT_NOT_FOUND', written: 'Monzo' });
      expect(issues[0].accounts).toEqual(
        expect.arrayContaining([wiseCandidate(wise.id), revolutCandidate(revolut.id)])
      );
    });

    it('BANK_ACCOUNT_AMBIGUOUS, with no full account number anywhere', async () => {
      const { actor, studio } = await setup();
      const a = await createBankAccount(prisma, studio.id, { currency: 'EUR', bankName: 'Wise Europe', accountNumber: '111122223333' });
      const b = await createBankAccount(prisma, studio.id, { currency: 'EUR', bankName: 'Wise Belgium', accountNumber: '444455556666' });

      const res = await resolve(actor, { currency: 'EUR', bankAccount: 'wise' });
      const issues = await issuesOf(Promise.resolve(res));

      expect(issues[0].kind).toBe('BANK_ACCOUNT_AMBIGUOUS');
      expect(issues[0].accounts).toEqual(
        expect.arrayContaining([
          {
            bankAccountId: a.id,
            label: 'Wise Europe ••3333',
            bankName: { freelancerText: 'Wise Europe' },
            lastFour: '3333',
            currency: 'EUR',
          },
          {
            bankAccountId: b.id,
            label: 'Wise Belgium ••6666',
            bankName: { freelancerText: 'Wise Belgium' },
            lastFour: '6666',
            currency: 'EUR',
          },
        ])
      );
      const text = JSON.stringify(res);
      expect(text).not.toContain('111122223333');
      expect(text).not.toContain('444455556666');
    });
  });

  describe('product candidates carry unit, price and currency', () => {
    // Review 2026-10-13 R13-1: when the parties fail (a Customer not added yet), the lines still follow the currency
    // the request names, so no product in another currency is offered (it could never be pressed).
    // T32 (review 2026-10-13 R14-1): with no written currency either, the lines follow the currency the request drafts
    // in (the default account's), so no product in another currency is offered and a lone match needs no choice.
    it('with CUSTOMER_NOT_FOUND and no currency, products follow the default account currency (no EUR, no choice)', async () => {
      const { user, actor } = await setup();
      await createProduct(prisma, user.id, { name: 'Consulting', unit: 'hours', price: 50, currency: 'USD' });
      await createProduct(prisma, user.id, { name: 'Consulting', unit: 'hours', price: 45, currency: 'EUR' });
      const issues = await issuesOf(
        svc.resolveDraftRequest(actor, { customer: 'Globex', lines: [{ description: 'consulting', quantity: '3' }] }, TODAY)
      );
      expect(issues.map((i) => i.kind)).toEqual(['CUSTOMER_NOT_FOUND']);
      expect(JSON.stringify(issues)).not.toContain('"EUR"');
    });

    it('with CUSTOMER_NOT_FOUND and currency "USD", no EUR product is a candidate', async () => {
      const { user, actor } = await setup();
      await createProduct(prisma, user.id, { name: 'Consulting', unit: 'hours', price: 50, currency: 'USD' });
      await createProduct(prisma, user.id, { name: 'Consulting', unit: 'hours', price: 45, currency: 'EUR' });
      const issues = await issuesOf(
        svc.resolveDraftRequest(actor, { customer: 'Globex', currency: 'USD', lines: [{ description: 'consulting', quantity: '3' }] }, TODAY)
      );
      expect(issues.map((i) => i.kind)).toContain('CUSTOMER_NOT_FOUND');
      expect(JSON.stringify(issues)).not.toContain('"EUR"');
      expect(issues.some((i) => i.kind === 'PRODUCT_AMBIGUOUS')).toBe(false);
    });

    // Review 2026-10-13 R12-2: above the 50 listed, the issue carries how many products match in all.
    it('PRODUCT_AMBIGUOUS with 60 matches lists 50 and carries total 60; 50 or fewer carry no total', async () => {
      const { user, actor } = await setup();
      for (let n = 0; n < 60; n++) {
        await createProduct(prisma, user.id, { name: `Audit ${String(n).padStart(2, '0')}`, unit: 'h', price: 10, currency: 'USD' });
      }
      const issues = await issuesOf(resolve(actor, { currency: 'USD', lines: [{ description: 'audit', quantity: '1' }] }));
      expect(issues[0]).toMatchObject({ kind: 'PRODUCT_AMBIGUOUS', total: 60 });
      expect(issues[0].candidates).toHaveLength(50);
    });

    it('PRODUCT_AMBIGUOUS: Product.price, and the Custom price for the Customer when one is agreed', async () => {
      const { user, actor, acme } = await setup();
      const basic = await createProduct(prisma, user.id, { name: 'Consulting basic', unit: 'hours', price: 50, currency: 'USD' });
      const premium = await createProduct(prisma, user.id, { name: 'Consulting premium', unit: 'days', price: 90, currency: 'USD' });
      await createCustomPrice(prisma, premium.id, acme.id, { price: 40 });

      const issues = await issuesOf(
        resolve(actor, { currency: 'USD', lines: [{ description: 'consulting', quantity: '1' }] })
      );

      expect(issues[0]).toMatchObject({ kind: 'PRODUCT_AMBIGUOUS', lineIndex: 0, written: 'consulting' });
      expect(issues[0].candidates).toHaveLength(2);
      expect(issues[0].candidates).toEqual(
        expect.arrayContaining([
          { productId: basic.id, name: { freelancerText: 'Consulting basic' }, unit: 'hours', price: '50.00', currency: 'USD' },
          { productId: premium.id, name: { freelancerText: 'Consulting premium' }, unit: 'days', price: '40.00', currency: 'USD' },
        ])
      );
    });
  });

  describe('MCP create_draft_invoice', () => {
    async function mcp(args: Record<string, unknown>) {
      const s = await setup();
      const { fullKey } = await createPersonalKey(prisma, s.user.id, { name: 'Claude', canCreateDrafts: true });
      const res = await route.POST(
        post({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: 'create_draft_invoice', arguments: args } }, fullKey)
      );
      expect(res.status).toBe(200);
      return { ...s, result: (await res.json()).result as any };
    }

    it('both senderProfile and senderProfileId is a VALIDATION failure with the exact words, nothing created', async () => {
      const { result } = await mcp({ customer: 'Acme Corp', lines: [LINE], senderProfile: 'Studio', senderProfileId: 'clx0sp000000000000000001' });

      expect(result.isError).toBe(true);
      expect(result.structuredContent.code).toBe('VALIDATION');
      expect(JSON.stringify(result.structuredContent.fieldErrors)).toContain(BOTH);
      expect(await prisma.invoice.count()).toBe(0);
    });

    it('a foreign senderProfileId is DRAFT_ISSUES with SENDER_PROFILE_NOT_FOUND and no foreign name', async () => {
      const other = await createFreelancer(prisma, { email: 't08-c@example.com', timeZone: TZ });
      const secret = await createSenderProfile(prisma, other.id, { name: 'Secret Studio Ltd' });
      const { result } = await mcp({ customer: 'Acme Corp', lines: [LINE], senderProfileId: secret.id });

      expect(result.isError).toBe(true);
      expect(result.structuredContent.details.kind).toBe('DRAFT_ISSUES');
      expect(result.structuredContent.details.issues).toEqual([
        expect.objectContaining({ kind: 'SENDER_PROFILE_NOT_FOUND', written: secret.id }),
      ]);
      expect(JSON.stringify(result)).not.toContain('Secret Studio Ltd');
      expect(await prisma.invoice.count()).toBe(0);
    });

    it('senderProfileId of the own profile creates the draft under it', async () => {
      const s = await setup();
      const { fullKey } = await createPersonalKey(prisma, s.user.id, { name: 'Claude', canCreateDrafts: true });
      const res = await route.POST(
        post(
          {
            jsonrpc: '2.0',
            id: ++rpcId,
            method: 'tools/call',
            params: {
              name: 'create_draft_invoice',
              arguments: { customer: 'Acme Corp', lines: [LINE], currency: 'UAH', senderProfileId: s.fop.id },
            },
          },
          fullKey
        )
      );
      const result = (await res.json()).result as any;

      expect(result.isError).toBeFalsy();
      const invoice = await prisma.invoice.findFirstOrThrow();
      expect(invoice.senderProfileId).toBe(s.fop.id);
      expect(invoice.currency).toBe('UAH');
    });

    it('existing clients without the new fields behave as before', async () => {
      const { result } = await mcp({ customer: 'Acme Corp', lines: [LINE] });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ status: 'DRAFT', repeated: false });
    });
  });
});
