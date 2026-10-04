// T24 (NFR latency budget, spec.md §6): a Freelancer with 5,000 invoices gets summary figures,
// Debtors and Expected payments within 1.5 s (p95) and list and single-record answers within 800 ms
// (p95), measured server-side around the real POST /api/mcp handler on a throwaway database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Currency, InvoiceStatus, Prisma } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { createPersonalKey } from '../../support/factories/personal-key';
import { createCustomer } from '../../support/factories/customer';
import { normalizeInvoiceNumber } from '@/lib/services/invoices/numbering';
import { startMcpHarness, type McpHarness } from '../../support/mcp-e2e';
import { KYIV, addInvoice, seedFreelancer } from '../services/dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const INVOICES = 5_000;
const ROUNDS = 20;
const AGGREGATE_BUDGET_MS = 1_500;
const LIST_BUDGET_MS = 800;

const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

describe.runIf(containerRuntimeAvailable)('Latency budget with 5,000 invoices (T24)', () => {
  let h: McpHarness;
  let fullKey: string;
  let someInvoiceId: string;
  let someInvoiceNumber: string;

  beforeAll(async () => {
    h = await startMcpHarness();
    const s = await seedFreelancer(h.factoryPrisma, ['USD', 'EUR', 'GBP']);
    await h.factoryPrisma.user.update({ where: { id: s.userId }, data: { timeZone: KYIV } });
    const template = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 1 });
    someInvoiceId = template.id;
    someInvoiceNumber = template.invoiceNumber;
    const customers = [s.customer];
    for (let i = 0; i < 49; i += 1) customers.push(await createCustomer(h.factoryPrisma, s.userId, { name: `Scale Customer ${i}` }));

    const { items: _items, id: _id, createdAt: _c, updatedAt: _u, ...base } = template;
    void [_items, _id, _c, _u];
    const statuses: InvoiceStatus[] = ['PAID', 'PENDING', 'OVERDUE', 'PENDING', 'PAID'];
    const currencies: Currency[] = ['USD', 'EUR', 'GBP'];
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const rows: Prisma.InvoiceCreateManyInput[] = Array.from({ length: INVOICES - 1 }, (_v, i) => {
      const number = `${s.profile.invoicePrefix}-S${String(i).padStart(6, '0')}`;
      const status = statuses[i % statuses.length];
      const total = ((i * 37) % 100000) / 100 + 1;
      return {
        ...base,
        customerId: customers[i % customers.length].id,
        customerName: customers[i % customers.length].name,
        invoiceNumber: number,
        invoiceNumberKey: normalizeInvoiceNumber(number),
        status,
        currency: currencies[i % currencies.length],
        subtotal: total,
        total,
        issueDate: new Date(now - (i % 700) * day),
        dueDate: new Date(now + ((i % 120) - 60) * day),
      };
    });
    for (let i = 0; i < rows.length; i += 1000) await h.factoryPrisma.invoice.createMany({ data: rows.slice(i, i + 1000) });
    expect(await h.factoryPrisma.invoice.count()).toBe(INVOICES);
    ({ fullKey } = await createPersonalKey(h.factoryPrisma, s.userId));
  }, 180_000);

  afterAll(async () => {
    await h?.stop();
  });

  async function measure(name: string, args: Record<string, unknown>) {
    await h.call(fullKey, name, args); // warm-up: connection and plan caches, as a running server has
    const times: number[] = [];
    for (let i = 0; i < ROUNDS; i += 1) {
      const r = await h.call(fullKey, name, args);
      expect(r.isError, `${name}: ${JSON.stringify(r.structuredContent).slice(0, 200)}`).toBe(false);
      times.push(r.ms);
    }
    return p95(times);
  }

  it.each([
    ['get_summary_figures', { period: { preset: 'this-year' } }],
    ['get_summary_figures', { period: { preset: 'all-time' } }],
    ['list_debtors', { pageSize: 50 }],
    ['list_expected_payments', { pageSize: 50 }],
    ['list_expected_payments', { period: { preset: 'this-year' }, pageSize: 50 }],
  ])('%s %j stays within the 1.5 s aggregate budget (p95)', async (name, args) => {
    expect(await measure(name as string, args as Record<string, unknown>)).toBeLessThanOrEqual(AGGREGATE_BUDGET_MS);
  });

  it.each([
    ['list_overdue_invoices', { pageSize: 50 }],
    ['list_customers', { pageSize: 50 }],
    ['list_customers', { name: 'scale', pageSize: 50 }],
    ['search_invoices', { pageSize: 50 }],
    ['search_invoices', { customer: 'Scale Customer 7', pageSize: 50 }],
    ['search_invoices', { status: ['paid', 'overdue'], issueDateFrom: '2026-01-01', pageSize: 50 }],
  ])('%s %j stays within the 800 ms list budget (p95)', async (name, args) => {
    expect(await measure(name as string, args as Record<string, unknown>)).toBeLessThanOrEqual(LIST_BUDGET_MS);
  });

  it.each([['by id'], ['by number']])('get_invoice %s stays within the 800 ms budget (p95)', async (how) => {
    const args = how === 'by id' ? { invoiceId: someInvoiceId } : { invoiceNumber: someInvoiceNumber };
    expect(await measure('get_invoice', args)).toBeLessThanOrEqual(LIST_BUDGET_MS);
  });
});
