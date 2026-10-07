// invoice-integrity T09 (spec.md §5 AC-02, AC-11, AC-12, AC-14, AC-15, AC-19, AC-20b, AC-21b) —
// updateInvoice on a draft: every draft rule on the locked row, all failures together in one
// VALIDATION; a passing save refreshes the issued details, writes the lines as sent and bumps the
// version; Save with PENDING freezes the details. contracts/server-actions.md §updateInvoice step 7.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Invoice, InvoiceItem, PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createProduct } from '../../../support/factories/product';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  details?: unknown;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = { updateInvoice: (a: unknown, id: string, input: unknown) => Promise<Result> };

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe.runIf(containerRuntimeAvailable)('updateInvoice on a draft (T09)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/invoices/invoices')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed(overrides: Record<string, unknown> = {}) {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const senderProfile = await createSenderProfile(prisma, user.id);
    const usd = await createBankAccount(prisma, senderProfile.id, { currency: 'USD' });
    const eur = await createBankAccount(prisma, senderProfile.id, { currency: 'EUR' });
    const customer = await createCustomer(prisma, user.id, { address: '1 Old Road' });
    const consulting = await createProduct(prisma, user.id, { name: 'Consulting', currency: 'USD' });
    const retiredUsd = await createProduct(prisma, user.id, { name: 'Consulting 2025', currency: 'USD', isActive: false });
    const invoice = await seedInvoice(prisma, {
      senderProfile,
      customer,
      bankAccount: usd,
      items: [{ name: 'Work', quantity: 1, rate: 1000, amount: 1000 }],
      overrides: {
        invoiceNumber: 'INV-2026-0042',
        issueDate: day('2026-12-28'),
        dueDate: day('2027-01-11'),
        ...overrides,
      } as never,
    });
    return { user, actor, senderProfile, usd, eur, customer, consulting, retiredUsd, invoice };
  }

  const stored = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });

  function formFrom(inv: Invoice & { items: InvoiceItem[] }, over: Record<string, unknown> = {}) {
    return {
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      senderProfileId: inv.senderProfileId,
      bankAccountId: inv.bankAccountId,
      customerId: inv.customerId,
      issueDate: iso(inv.issueDate),
      dueDate: iso(inv.dueDate),
      currency: inv.currency,
      poNumber: inv.poNumber ?? '',
      paymentTerms: inv.paymentTerms ?? '',
      taxRate: Number(inv.taxRate),
      discount: Number(inv.discount),
      shipping: Number(inv.shipping),
      notes: inv.notes ?? '',
      terms: inv.terms ?? '',
      items: inv.items.map((item) => ({
        id: item.id,
        productId: item.productId ?? undefined,
        productName: item.name,
        description: item.description ?? '',
        unit: item.unit,
        quantity: Number(item.quantity),
        price: Number(item.rate),
        total: Number(item.amount),
      })),
      loadedVersion: inv.version,
      ...over,
    };
  }

  it('AC-11: a USD bank account on a EUR draft is refused on the bank account', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { currency: 'EUR' }));
    expect(res).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { bankAccountId: ['This account is in USD while the invoice is in EUR.'] },
    });
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-12: active and inactive USD product lines on a EUR draft are named; a free-text line is not checked', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const line = (productId: string | undefined, name: string) => ({
      id: name, productId, productName: name, description: '', unit: 'h', quantity: 1, price: 10, total: 10,
    });
    const res = await svc.updateInvoice(
      s.actor,
      s.invoice.id,
      formFrom(before, {
        currency: 'EUR',
        bankAccountId: s.eur.id,
        items: [line(s.consulting.id, 'Consulting'), line(undefined, 'Free text'), line(s.retiredUsd.id, 'Consulting 2025')],
      })
    );
    expect(res.fieldErrors).toEqual({
      'items.0.productId': ['“Consulting” is priced in USD while the invoice is in EUR.'],
      'items.2.productId': ['“Consulting 2025” is priced in USD while the invoice is in EUR.'],
    });
  });

  it('AC-19 + AC-09 + AC-11: several failing rules come back together in one VALIDATION', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(
      s.actor,
      s.invoice.id,
      formFrom(before, {
        currency: 'EUR',
        dueDate: '2026-12-01',
        items: [{ id: 'x', productName: 'Work', description: '', unit: 'h', quantity: 1000, price: 150000, total: 0 }],
      })
    );
    expect(res).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(res.fieldErrors).toEqual({
      bankAccountId: ['This account is in USD while the invoice is in EUR.'],
      'items.0.total': ["The line amount can't exceed 99,999,999.99."],
      subtotal: ["The subtotal can't exceed 99,999,999.99."],
      total: ["The total can't exceed 99,999,999.99."],
      dueDate: ["The due date can't be before the issue date (28 Dec 2026)."],
    });
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-19: a subtotal over the limit is refused even when the discount brings the total under it', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(
      s.actor,
      s.invoice.id,
      formFrom(before, {
        discount: 20_000_000,
        items: [
          { id: 'a', productName: 'A', description: '', unit: 'h', quantity: 1, price: 60_000_000, total: 0 },
          { id: 'b', productName: 'B', description: '', unit: 'h', quantity: 1, price: 50_000_000, total: 0 },
        ],
      })
    );
    expect(res.fieldErrors).toEqual({ subtotal: ["The subtotal can't exceed 99,999,999.99."] });
  });

  it('AC-20b: lines of 1,000.00 with 200.00 shipping refuse a 1,250.00 discount and accept 1,200.00', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const refused = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { shipping: 200, discount: 1250 }));
    expect(refused.fieldErrors).toEqual({ discount: ["Discount can't exceed the subtotal plus shipping."] });
    const accepted = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { shipping: 200, discount: 1200 }));
    expect(accepted.success).toBe(true);
  });

  it('AC-14: a draft saved before the release with mismatching currencies is refused on its next notes-only save', async () => {
    const s = await seed({ currency: 'EUR' });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'just a note' }));
    expect(res.fieldErrors).toEqual({ bankAccountId: ['This account is in USD while the invoice is in EUR.'] });
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-02: a draft save refreshes the issued details; Save with PENDING freezes them', async () => {
    const s = await seed();
    await prisma.customer.update({ where: { id: s.customer.id }, data: { address: '2 Corrected Road' } });
    const before = await stored(s.invoice.id);

    const saved = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'saved' }));
    expect(saved.success).toBe(true);
    expect(saved.data.version).toBe(before.version + 1);
    const afterSave = await stored(s.invoice.id);
    expect(afterSave.customerAddress).toBe('2 Corrected Road');

    const issued = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(afterSave, { status: 'PENDING' }));
    expect(issued.success).toBe(true);
    expect((await stored(s.invoice.id)).status).toBe('PENDING');

    await prisma.customer.update({ where: { id: s.customer.id }, data: { address: '3 Later Road' } });
    const afterIssue = await stored(s.invoice.id);
    const notes = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(afterIssue, { notes: 'issued note' }));
    expect(notes.success).toBe(true);
    expect((await stored(s.invoice.id)).customerAddress).toBe('2 Corrected Road');
  });

  it('Save and issue with a failing rule stays a draft and stores nothing', async () => {
    const s = await seed({ currency: 'EUR' });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { status: 'PENDING' }));
    expect(res.code).toBe('VALIDATION');
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-15: a line for a deactivated product in the same currency is kept exactly as sent', async () => {
    const s = await seed();
    await prisma.product.update({ where: { id: s.consulting.id }, data: { isActive: false } });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(
      s.actor,
      s.invoice.id,
      formFrom(before, {
        notes: 'note',
        items: [
          { id: 'c', productId: s.consulting.id, productName: 'Consulting', description: 'Q1', unit: 'h', quantity: 2, price: 75.5, total: 151 },
        ],
      })
    );
    expect(res.success).toBe(true);
    const after = await stored(s.invoice.id);
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({ productId: s.consulting.id, name: 'Consulting', description: 'Q1' });
    expect(Number(after.total)).toBe(151);
  });

  it('AC-21b: moving the issue date into the next year keeps the number', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { issueDate: '2027-01-03', dueDate: '2027-01-17' }));
    expect(res.success).toBe(true);
    expect(res.data.invoiceNumber).toBe('INV-2026-0042');
  });
});

describe.runIf(!containerRuntimeAvailable)('updateInvoice on a draft (T09)', () => {
  it.skip('skipped: no container runtime', () => {});
});
