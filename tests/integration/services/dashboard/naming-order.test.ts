// T18 (spec.md §5 AC-06, QG-1, QG-4): names from the most recent invoice in the group, Debtor tie
// order by name, sender profiles by name and accounts by bank then holder, two-Freelancer
// isolation and rows read per query. Names are digit-prefixed so C and linguistic collation agree.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceStatus, PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { addInvoice, createQueryRecorder, seedFreelancer, type Seed } from './harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
const recorder = createQueryRecorder(() => testClient);
vi.mock('@/prisma', () => ({ prisma: recorder.proxy }));

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Period = { from: string; to: string };
type Res<T = unknown> = { success: true; data: T } | { success: false; code: string; error: string };
type Sender = {
  senderProfileId: string;
  senderName: string;
  totalReceived: number;
  totalPlanned: number;
  allFuturePlanned: number;
  accounts: { accountId: string; accountName: string; bankName: string; received: number; planned: number }[];
};
type Debtor = { customerId: string; customerName: string; total: number; count: number; currencies: string[] };
type Recent = { id: string; customerName: string; total: number };
type Group = { currency: string; invoices: { id: string; customerName: string }[]; total: number; count: number };
type Service = {
  getSenderAccounts: (a: Actor, c: string, p?: Period) => Promise<Res<Sender[]>>;
  getRecentInvoices: (a: Actor, c: string) => Promise<Res<Recent[]>>;
  getDebtors: (a: Actor, c: string) => Promise<Res<Debtor[]>>;
  getExpectedPayments: (a: Actor, c: string) => Promise<Res<Group[]>>;
};

function data<T>(r: Res<T>): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

const day = (n: number) => new Date(Date.UTC(2026, 0, n, 9));
const PAST_DUE = new Date('2026-01-31T09:00:00Z');

describe.runIf(containerRuntimeAvailable)('dashboard names, order, isolation (T18, AC-06)', () => {
  let db: TestDatabase;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/dashboard/dashboard')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    recorder.reset();
    // ADR-0005: pending invoices become overdue once past due, so the fixtures need a fixed "now"
    // before their due dates. Only Date is faked so the pg driver's timers keep running.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });
  afterEach(async () => {
    vi.useRealTimers();
    await truncateAllTables(testClient);
  });

  const overdue = (
    s: Seed,
    customer: Seed['customer'],
    total: number,
    customerName: string,
    issueDate: Date,
    status: InvoiceStatus = 'OVERDUE',
  ) => addInvoice(s, { currency: 'USD', status, total, issueDate, dueDate: PAST_DUE, customerName, customer });

  describe('Debtors (AC-06)', () => {
    it('a renamed Customer appears once, under the name on the latest issue date, even when created first', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const c = await createCustomer(testClient, s.userId, { name: '1 Current Name' });
      // The newer invoice (latest issue date) is inserted FIRST, so created order disagrees.
      await overdue(s, c, 10, '1 Newest Name', day(20));
      await overdue(s, c, 5, '1 Oldest Name', day(5));
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      const debtors = data(await svc.getDebtors(actor, 'USD'));
      expect(debtors).toHaveLength(1);
      expect(debtors[0]).toMatchObject({ customerId: c.id, customerName: '1 Newest Name', total: 15, count: 2 });
    });

    it('on the same issue date the invoice created last supplies the name', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const c = await createCustomer(testClient, s.userId, { name: '1 Cust' });
      await overdue(s, c, 10, '9 Created First', day(12));
      await overdue(s, c, 10, '1 Created Last', day(12));
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      expect(data(await svc.getDebtors(actor, 'USD'))[0].customerName).toBe('1 Created Last');
    });

    it('the name comes only from the counted (overdue) invoices of the currency', async () => {
      const s = await seedFreelancer(testClient, ['USD', 'EUR']);
      const c = await createCustomer(testClient, s.userId, { name: '1 Cust' });
      await overdue(s, c, 10, '1 Overdue Name', day(5));
      await overdue(s, c, 99, '2 Paid Later Name', day(25), 'PAID');
      await addInvoice(s, { currency: 'EUR', status: 'OVERDUE', total: 7, issueDate: day(28), dueDate: PAST_DUE, customerName: '3 Euro Name', customer: c });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      const usd = data(await svc.getDebtors(actor, 'USD'));
      expect(usd).toHaveLength(1);
      expect(usd[0]).toMatchObject({ customerName: '1 Overdue Name', total: 10, count: 1 });
    });

    it('a tie at the cut-off is ordered by name and decides the top three, every time', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const big = await createCustomer(testClient, s.userId, { name: '1 Big' });
      const mid = await createCustomer(testClient, s.userId, { name: '2 Mid' });
      const yankee = await createCustomer(testClient, s.userId, { name: '8 Yankee' });
      const xray = await createCustomer(testClient, s.userId, { name: '7 Xray' });
      // Insertion order is the reverse of the name order, and the totals tie exactly:
      // 0.10 + 0.20 is 0.30 in numeric (float drift would make it 0.30000000000000004).
      await overdue(s, yankee, 0.3, '8 Yankee', day(10));
      await overdue(s, xray, 0.1, '7 Xray', day(10));
      await overdue(s, xray, 0.2, '7 Xray', day(10));
      await overdue(s, mid, 500, '2 Mid', day(10));
      await overdue(s, big, 1000, '1 Big', day(10));
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      for (let i = 0; i < 3; i += 1) {
        const debtors = data(await svc.getDebtors(actor, 'USD'));
        expect(debtors.map((d) => d.customerName)).toEqual(['1 Big', '2 Mid', '7 Xray']);
        expect(debtors[2]).toMatchObject({ total: 0.3, count: 2 });
      }
    });

    it('no overdue invoices gives an empty list', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 5, dueDate: PAST_DUE });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      expect(data(await svc.getDebtors(actor, 'USD'))).toEqual([]);
    });
  });

  describe('sender accounts (AC-06, spec §1 change 3)', () => {
    it('lists profiles by name and accounts by bank name then holder name, whatever the creation order', async () => {
      const user = await seedFreelancer(testClient, []);
      const paid = async (
        profile: Awaited<ReturnType<typeof createSenderProfile>>,
        bankName: string,
        accountName: string,
        total: number,
      ) => {
        const bankAccount = await createBankAccount(testClient, profile.id, { bankName, accountName, currency: 'USD', isDefault: false });
        await createInvoice(testClient, {
          senderProfile: profile,
          customer: user.customer,
          bankAccount,
          items: [{ name: 'Work', quantity: 1, rate: total, amount: total }],
          overrides: {
            invoiceNumber: `${profile.invoicePrefix}-${bankName.slice(0, 1)}${accountName.slice(0, 1)}`,
            status: 'PAID',
            total,
            subtotal: total,
            currency: 'USD',
            issueDate: day(10),
          },
        });
      };
      const beta = await createSenderProfile(testClient, user.userId, { name: '2 Beta Profile', isDefault: false });
      const alpha = await createSenderProfile(testClient, user.userId, { name: '1 Alpha Profile', isDefault: false });
      await paid(beta, '2 Bank', '1 Holder', 1);
      await paid(alpha, '2 Bank', '2 Holder', 2);
      await paid(alpha, '1 Bank', '9 Holder', 3);
      await paid(alpha, '2 Bank', '1 Holder', 4);
      const actor = await actingFreelancerForTest(user.userId, 'UTC');
      for (let i = 0; i < 2; i += 1) {
        const senders = data(await svc.getSenderAccounts(actor, 'USD'));
        expect(senders.map((s) => s.senderName)).toEqual(['1 Alpha Profile', '2 Beta Profile']);
        expect(senders[0].accounts.map((a) => `${a.bankName}/${a.accountName}`)).toEqual([
          '1 Bank/9 Holder',
          '2 Bank/1 Holder',
          '2 Bank/2 Holder',
        ]);
        expect(senders[0]).toMatchObject({ totalReceived: 9 });
      }
    });

    it('bank and holder names come from the most recent invoice of the account', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const bankAccount = s.bank.USD;
      const mk = (n: number, bankName: string, accountName: string, issueDate: Date) =>
        createInvoice(testClient, {
          senderProfile: s.profile,
          customer: s.customer,
          bankAccount,
          items: [{ name: 'Work', quantity: 1, rate: 10, amount: 10 }],
          overrides: {
            invoiceNumber: `${s.profile.invoicePrefix}-N${n}`,
            status: 'PAID',
            total: 10,
            subtotal: 10,
            currency: 'USD',
            issueDate,
            bankName,
            accountName,
          },
        });
      await mk(1, '1 New Bank', '1 New Holder', day(20)); // latest issue date, created first
      await mk(2, '9 Old Bank', '9 Old Holder', day(3));
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      const senders = data(await svc.getSenderAccounts(actor, 'USD'));
      expect(senders).toHaveLength(1);
      expect(senders[0].accounts).toHaveLength(1);
      expect(senders[0].accounts[0]).toMatchObject({ bankName: '1 New Bank', accountName: '1 New Holder', received: 20 });
    });
  });

  describe('sender name and the period (AC-06, spec §1 change 1)', () => {
    const paidOn = (s: Seed, n: number, issueDate: Date, names: { senderName: string; bankName: string; accountName: string }) =>
      createInvoice(testClient, {
        senderProfile: s.profile,
        customer: s.customer,
        bankAccount: s.bank.USD,
        items: [{ name: 'Work', quantity: 1, rate: 10, amount: 10 }],
        overrides: {
          invoiceNumber: `${s.profile.invoicePrefix}-S${n}`,
          status: 'PAID',
          total: 10,
          subtotal: 10,
          currency: 'USD',
          issueDate,
          ...names,
        },
      });

    it('a renamed sender profile appears once, under the name on the latest issue date, even when created first', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      await paidOn(s, 1, day(20), { senderName: '1 Newest Sender', bankName: 'B', accountName: 'H' }); // created first
      await paidOn(s, 2, day(5), { senderName: '9 Oldest Sender', bankName: 'B', accountName: 'H' });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      const senders = data(await svc.getSenderAccounts(actor, 'USD'));
      expect(senders).toHaveLength(1);
      expect(senders[0]).toMatchObject({ senderProfileId: s.profileId, senderName: '1 Newest Sender', totalReceived: 20 });
    });

    it('the names come only from invoices inside the period; a newer one outside it supplies none', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      await paidOn(s, 1, day(10), { senderName: '2 In Period', bankName: '2 In Bank', accountName: '2 In Holder' });
      await paidOn(s, 2, day(25), { senderName: '1 Out Of Period', bankName: '1 Out Bank', accountName: '1 Out Holder' });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      const inPeriod = data(await svc.getSenderAccounts(actor, 'USD', { from: '2026-01-01', to: '2026-01-15' }));
      expect(inPeriod).toHaveLength(1);
      expect(inPeriod[0]).toMatchObject({ senderName: '2 In Period', totalReceived: 10 });
      expect(inPeriod[0].accounts[0]).toMatchObject({ bankName: '2 In Bank', accountName: '2 In Holder', received: 10 });
      // Without a period the newest invoice is in scope and supplies the names.
      const all = data(await svc.getSenderAccounts(actor, 'USD'));
      expect(all[0]).toMatchObject({ senderName: '1 Out Of Period', totalReceived: 20 });
      expect(all[0].accounts[0]).toMatchObject({ bankName: '1 Out Bank', accountName: '1 Out Holder' });
    });
  });

  describe('recent invoices and expected payments', () => {
    it('recent invoices: the 10 newest created, newest first, in the currency', async () => {
      const s = await seedFreelancer(testClient, ['USD', 'EUR']);
      const ids: string[] = [];
      for (let i = 1; i <= 12; i += 1) {
        ids.push((await addInvoice(s, { currency: 'USD', status: 'PENDING', total: i, issueDate: day(5) })).id);
      }
      await addInvoice(s, { currency: 'EUR', status: 'PENDING', total: 1 });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      recorder.reset();
      const recent = data(await svc.getRecentInvoices(actor, 'USD'));
      expect(recent.map((r) => r.id)).toEqual(ids.slice(2).reverse());
      expect(recorder.rowCounts.length).toBeGreaterThan(0);
      for (const rows of recorder.rowCounts) expect(rows).toBeLessThanOrEqual(10);
    });

    it('expected payments: earliest 3 per currency, total and count over all pending', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const ids: string[] = [];
      for (const [i, total] of [5, 4, 3, 2, 1].entries()) {
        // Created in reverse due-date order.
        ids.push((await addInvoice(s, { currency: 'USD', status: 'PENDING', total, dueDate: new Date(Date.UTC(2026, 5, 10 - i)) })).id);
      }
      await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 100, dueDate: PAST_DUE });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      recorder.reset();
      const groups = data(await svc.getExpectedPayments(actor, 'USD'));
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ currency: 'USD', total: 15, count: 5 });
      expect(groups[0].invoices.map((i) => i.id)).toEqual([ids[4], ids[3], ids[2]]);
      expect(recorder.rowCounts.length).toBeGreaterThan(0);
      for (const rows of recorder.rowCounts) expect(rows).toBeLessThanOrEqual(3);
    });
  });

  describe('two Freelancers (QG-1)', () => {
    async function twoFreelancers() {
      const a = await seedFreelancer(testClient, ['USD']);
      const b = await seedFreelancer(testClient, ['USD']);
      const at = new Date('2026-01-10T09:00:00Z');
      await addInvoice(a, { currency: 'USD', status: 'PAID', total: 10, issueDate: at });
      await addInvoice(a, { currency: 'USD', status: 'PENDING', total: 20, issueDate: at, dueDate: new Date('2026-02-12T09:00:00Z') });
      await addInvoice(a, { currency: 'USD', status: 'OVERDUE', total: 30, issueDate: at, dueDate: PAST_DUE });
      await addInvoice(b, { currency: 'USD', status: 'PAID', total: 1000, issueDate: at });
      await addInvoice(b, { currency: 'USD', status: 'PENDING', total: 2000, issueDate: at, dueDate: new Date('2026-02-12T09:00:00Z') });
      await addInvoice(b, { currency: 'USD', status: 'OVERDUE', total: 3000, issueDate: at, dueDate: PAST_DUE });
      return { a, b, actor: await actingFreelancerForTest(a.userId, 'UTC') };
    }

    it('getSenderAccounts never includes B profiles or amounts', async () => {
      const { a, b, actor } = await twoFreelancers();
      for (const period of [undefined, { from: '2026-01-01', to: '2026-03-01' }]) {
        const senders = data(await svc.getSenderAccounts(actor, 'USD', period));
        expect(senders.map((s) => s.senderProfileId)).toEqual([a.profileId]);
        expect(senders.map((s) => s.senderProfileId)).not.toContain(b.profileId);
        expect(senders[0]).toMatchObject({ totalReceived: 10, totalPlanned: 50, allFuturePlanned: 50 });
      }
    });

    it('getRecentInvoices never includes B invoices', async () => {
      const { actor } = await twoFreelancers();
      const recent = data(await svc.getRecentInvoices(actor, 'USD'));
      expect(recent.map((r) => r.total).sort((x, y) => x - y)).toEqual([10, 20, 30]);
    });

    it('getDebtors never includes B customers or amounts', async () => {
      const { a, actor } = await twoFreelancers();
      const debtors = data(await svc.getDebtors(actor, 'USD'));
      expect(debtors).toHaveLength(1);
      expect(debtors[0]).toMatchObject({ customerId: a.customer.id, total: 30, count: 1 });
    });

    it('getExpectedPayments never includes B invoices', async () => {
      const { actor } = await twoFreelancers();
      const groups = data(await svc.getExpectedPayments(actor, 'USD'));
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ total: 20, count: 1 });
      expect(groups[0].invoices).toHaveLength(1);
    });
  });

  describe('QG-4 and failures', () => {
    it('a Freelancer with no invoices gets empty sections', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      expect(data(await svc.getSenderAccounts(actor, 'USD'))).toEqual([]);
      expect(data(await svc.getRecentInvoices(actor, 'USD'))).toEqual([]);
      expect(data(await svc.getDebtors(actor, 'USD'))).toEqual([]);
      expect(data(await svc.getExpectedPayments(actor, 'USD'))).toEqual([]);
    });

    it('an unknown currency is VALIDATION with fieldErrors.currency, no query run', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      recorder.reset();
      const results = [
        await svc.getSenderAccounts(actor, 'XXX'),
        await svc.getRecentInvoices(actor, 'XXX'),
        await svc.getDebtors(actor, 'XXX'),
        await svc.getExpectedPayments(actor, 'XXX'),
      ];
      for (const r of results) {
        expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
        expect((r as unknown as { fieldErrors?: Record<string, string[]> }).fieldErrors?.currency).toEqual(['Unknown currency.']);
      }
      expect(recorder.rowCounts).toEqual([]);
    });

    it('a reversed period on sender accounts is VALIDATION', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      const r = await svc.getSenderAccounts(actor, 'USD', { from: '2026-09-30', to: '2026-09-01' });
      expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
    });
  });
});
