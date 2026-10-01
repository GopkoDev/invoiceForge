// T17 parity harness (sad.md §10 QG-2): the AC-05 fixture plus a recording Prisma wrapper.
// Reusable: T18 adds its sections (sender accounts, recent invoices, Debtors, Expected payments)
// to the same fixture and the same old-vs-new comparison.
import type { Currency, InvoiceStatus, PrismaClient } from '@prisma/client';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createCustomer } from '../../../support/factories/customer';
import { createInvoice } from '../../../support/factories/invoice';

export const KYIV = 'Europe/Kyiv';
/** Europe/Kyiv switches to DST on Sunday 2026-03-29 (03:00 -> 04:00); this range spans it. */
export const DST_PERIOD = { from: '2026-03-25', to: '2026-04-02' };
/** 89 local days across the same switch: weekly chart buckets. */
export const WEEKLY_PERIOD = { from: '2026-02-01', to: '2026-04-30' };
/** "Now" for the fixture: mid-range, so the chart has both a past and a future half. */
export const FIXTURE_NOW = new Date('2026-03-28T12:00:00Z');

export const cents = (n: number) => Math.round(n * 100);

/** Records the row count of every $queryRaw / $queryRawUnsafe result (QG-4 query log). */
export function createQueryRecorder(getClient: () => PrismaClient) {
  const rowCounts: number[] = [];
  const wrap =
    (name: '$queryRaw' | '$queryRawUnsafe') =>
    async (...args: unknown[]) => {
      const client = getClient() as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      const result = await client[name](...args);
      rowCounts.push(Array.isArray(result) ? result.length : 1);
      return result;
    };
  const proxy = new Proxy({} as PrismaClient, {
    get(_t, key) {
      if (key === '$queryRaw' || key === '$queryRawUnsafe') return wrap(key);
      const client = getClient() as unknown as Record<string | symbol, unknown>;
      const value = client[key];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
    },
  });
  return { proxy, rowCounts, reset: () => void (rowCounts.length = 0) };
}

export type Seed = {
  prisma: PrismaClient;
  userId: string;
  profileId: string;
  profile: Awaited<ReturnType<typeof createSenderProfile>>;
  bank: Record<string, Awaited<ReturnType<typeof createBankAccount>>>;
  customer: Awaited<ReturnType<typeof createCustomer>>;
};

let seq = 0;
export async function seedFreelancer(prisma: PrismaClient, currencies: Currency[] = ['USD', 'EUR']): Promise<Seed> {
  const user = await createFreelancer(prisma);
  const profile = await createSenderProfile(prisma, user.id);
  const bank: Seed['bank'] = {};
  for (const c of currencies) {
    bank[c] = await createBankAccount(prisma, profile.id, { currency: c, isDefault: c === currencies[0] });
  }
  const customer = await createCustomer(prisma, user.id, { name: `1 Customer ${user.id.slice(-6)}` });
  return { prisma, userId: user.id, profileId: profile.id, profile, bank, customer };
}

export async function addInvoice(
  s: Seed,
  o: {
    currency: Currency;
    status: InvoiceStatus;
    total: number;
    issueDate?: Date;
    dueDate?: Date;
    customerName?: string;
    customer?: Seed['customer'];
  }
) {
  seq += 1;
  return createInvoice(s.prisma, {
    senderProfile: s.profile,
    customer: o.customer ?? s.customer,
    bankAccount: s.bank[o.currency] ?? Object.values(s.bank)[0],
    items: [{ name: 'Work', quantity: 1, rate: o.total, amount: o.total }],
    overrides: {
      invoiceNumber: `${s.profile.invoicePrefix}-${String(seq).padStart(6, '0')}`,
      status: o.status,
      total: o.total,
      subtotal: o.total,
      currency: o.currency,
      ...(o.issueDate ? { issueDate: o.issueDate } : {}),
      ...(o.dueDate ? { dueDate: o.dueDate } : {}),
      ...(o.customerName ? { customerName: o.customerName } : {}),
    },
  });
}

const d = (iso: string) => new Date(iso);

/** The AC-05 fixture: float drift, 2 currencies, renamed Customer, Debtor tie, DST switch. */
export async function seedParityFixture(prisma: PrismaClient) {
  const s = await seedFreelancer(prisma, ['USD', 'EUR']);
  // Extra Customers so T18 can add Debtor / top-three tie sections to the same fixture.
  const c2 = await createCustomer(prisma, s.userId, { name: '2 Second Customer' });
  const c3 = await createCustomer(prisma, s.userId, { name: '3 Third Customer' });
  const c4 = await createCustomer(prisma, s.userId, { name: '4 Fourth Customer' });

  // USD paid: 0.10 + 0.20 (+0.30) drift, straddling the DST switch and local midnight.
  await addInvoice(s, { currency: 'USD', status: 'PAID', total: 0.1, issueDate: d('2026-03-25T10:00:00Z') });
  await addInvoice(s, { currency: 'USD', status: 'PAID', total: 0.2, issueDate: d('2026-03-25T10:30:00Z') });
  await addInvoice(s, { currency: 'USD', status: 'PAID', total: 0.3, issueDate: d('2026-03-28T22:30:00Z') }); // 00:30 on 29 Mar Kyiv
  await addInvoice(s, { currency: 'USD', status: 'PAID', total: 1234.56, issueDate: d('2026-03-29T21:30:00Z'), customerName: 'Renamed Customer Ltd' }); // 00:30 on 30 Mar Kyiv, still 29 Mar UTC
  await addInvoice(s, { currency: 'USD', status: 'PAID', total: 10.01, issueDate: d('2026-03-10T09:00:00Z') }); // outside DST_PERIOD, inside weekly
  // USD pending / overdue by due date, past and future of FIXTURE_NOW.
  await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 500.05, issueDate: d('2026-03-20T09:00:00Z'), dueDate: d('2026-03-30T09:00:00Z') });
  await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 99.99, issueDate: d('2026-03-20T09:00:00Z'), dueDate: d('2026-04-01T21:30:00Z') }); // 00:30 on 2 Apr Kyiv
  await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 75.5, issueDate: d('2026-03-01T09:00:00Z'), dueDate: d('2026-03-26T09:00:00Z') });
  await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 75.5, issueDate: d('2026-03-02T09:00:00Z'), dueDate: d('2026-03-27T09:00:00Z') }); // tie on total
  await addInvoice(s, { currency: 'USD', status: 'DRAFT', total: 9999, issueDate: d('2026-03-26T09:00:00Z'), dueDate: d('2026-03-31T09:00:00Z') }); // never counts
  // A pending invoice due outside the period still feeds allFuturePayments (no date filter).
  await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 1000.01, issueDate: d('2026-03-20T09:00:00Z'), dueDate: d('2026-09-01T09:00:00Z') });
  // EUR.
  await addInvoice(s, { currency: 'EUR', status: 'PAID', total: 250.25, issueDate: d('2026-03-27T09:00:00Z') });
  await addInvoice(s, { currency: 'EUR', status: 'OVERDUE', total: 40, issueDate: d('2026-03-03T09:00:00Z'), dueDate: d('2026-03-28T09:00:00Z') });

  // T18 (AC-05): Debtors 151 / 60 / 30 / 30 in USD, so places 3 and 4 tie at the top-three
  // cut-off. C2 is renamed between its two overdue invoices.
  const at = (day: string) => d(`2026-03-${day}T09:00:00Z`);
  await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 20, customer: c2, customerName: 'Second Old Name', issueDate: at('04'), dueDate: at('20') });
  await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 40, customer: c2, customerName: 'Second New Name', issueDate: at('06'), dueDate: at('21') });
  await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 0.1, customer: c3, issueDate: at('05'), dueDate: at('22') });
  await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 29.9, customer: c3, issueDate: at('05'), dueDate: at('22') });
  await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 30, customer: c4, issueDate: at('05'), dueDate: at('23') });
  // More pending invoices (distinct due dates) so Expected payments shows 3 of more than 3.
  await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 12.34, customer: c2, issueDate: at('20'), dueDate: at('31') });
  await addInvoice(s, { currency: 'EUR', status: 'PENDING', total: 8.8, customer: c3, issueDate: at('20'), dueDate: at('30') });
  // A second sender profile with its own account and a paid invoice.
  const profile2 = await createSenderProfile(prisma, s.userId, { name: '0 Other Profile', isDefault: false });
  const bank2 = await createBankAccount(prisma, profile2.id, { currency: 'USD', bankName: 'Other Bank', accountName: 'Other Holder' });
  await createInvoice(prisma, {
    senderProfile: profile2,
    customer: c4,
    bankAccount: bank2,
    items: [{ name: 'Work', quantity: 1, rate: 15.15, amount: 15.15 }],
    overrides: {
      invoiceNumber: `${profile2.invoicePrefix}-000001`,
      status: 'PAID',
      total: 15.15,
      subtotal: 15.15,
      currency: 'USD',
      issueDate: d('2026-03-12T09:00:00Z'), // outside DST_PERIOD: keeps the T17 drift test exact
    },
  });
  return s;
}
