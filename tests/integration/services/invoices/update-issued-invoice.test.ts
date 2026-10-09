// invoice-integrity T08 (spec.md §5 AC-01, AC-06, AC-07, AC-08, AC-09, AC-10, AC-14; ADR-0003,
// ADR-0004) — updateInvoice on the locked row, checks in contract order (NOT_FOUND → CHANGED_ELSEWHERE
// → cancelled → lifecycle → locked fields → due date). An issued invoice writes only dueDate, notes,
// paymentTerms and poNumber (+ status/paidAt) and version + 1. contracts/server-actions.md §updateInvoice.
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

const LOCKED = "This field can't change on an issued invoice.";
const LOCKED_ERROR =
  'An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.';
const CHANGED_ELSEWHERE =
  'This invoice was changed elsewhere after you opened it. Reload it to see the latest version.';
const CANCELLED = "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.";

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe.runIf(containerRuntimeAvailable)('updateInvoice on an issued invoice (T08)', () => {
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
    vi.useRealTimers();
    await truncateAllTables(prisma);
  });

  async function seed(overrides: Record<string, unknown> = {}, bank: Record<string, unknown> = {}) {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const senderProfile = await createSenderProfile(prisma, user.id, { legalName: 'Old Legal LLC' });
    const bankAccount = await createBankAccount(prisma, senderProfile.id, { iban: 'UA00 OLD', ...bank });
    const customer = await createCustomer(prisma, user.id, { address: '1 Old Road' });
    const product = await createProduct(prisma, user.id, { name: 'Design' });
    const invoice = await seedInvoice(prisma, {
      senderProfile,
      customer,
      bankAccount,
      items: [
        { productId: product.id, name: 'Design', description: 'Logo', unit: 'h', quantity: 2, rate: 150, amount: 300 },
        { name: 'Hosting', unit: 'pcs', quantity: 1, rate: 30.5, amount: 30.5 },
      ],
      overrides: {
        invoiceNumber: 'INV-2025-0007',
        status: 'PENDING',
        issueDate: day('2026-03-10'),
        dueDate: day('2026-03-24'),
        taxRate: 20,
        discount: 10,
        shipping: 5,
        version: 2,
        ...overrides,
      } as never,
    });
    return { user, actor, senderProfile, bankAccount, customer, product, invoice };
  }

  /** The editor's save of an unedited invoice: its stored values, as the form sends them. */
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

  const stored = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });

  /** Everything but the four editable fields, status/paidAt, version and updatedAt. */
  const EDITABLE = ['dueDate', 'notes', 'paymentTerms', 'poNumber', 'status', 'paidAt', 'version', 'updatedAt'];
  function locked(inv: Awaited<ReturnType<typeof stored>>) {
    const rest = Object.fromEntries(Object.entries(inv).filter(([key]) => !EDITABLE.includes(key) && key !== 'items'));
    return { ...rest, items: inv.items.map((item) => ({ ...item, updatedAt: undefined })) };
  }

  it('AC-01: after the sender profile, Customer and bank account change, a notes-only save keeps every other field', async () => {
    const s = await seed({ status: 'PAID', paidAt: new Date('2025-04-01T10:00:00Z'), issueDate: day('2025-03-10'), dueDate: day('2025-03-24') });
    const before = await stored(s.invoice.id);
    await prisma.senderProfile.update({ where: { id: s.senderProfile.id }, data: { legalName: 'New Legal Ltd' } });
    await prisma.customer.update({ where: { id: s.customer.id }, data: { address: '9 New Road' } });
    await prisma.bankAccount.update({ where: { id: s.bankAccount.id }, data: { iban: 'UA99 NEW' } });

    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'Paid in full, thanks' }));

    expect(res.success).toBe(true);
    expect(res.data.version).toBe(3);
    const after = await stored(s.invoice.id);
    expect(after.notes).toBe('Paid in full, thanks');
    expect(after.version).toBe(3);
    expect(after.paidAt).toEqual(before.paidAt);
    expect(locked(after)).toEqual(locked(before));
    expect(after).toMatchObject({ senderLegalName: 'Old Legal LLC', customerAddress: '1 Old Road', bankIban: 'UA00 OLD' });
  });

  it('AC-07: a pending invoice overdue since yesterday takes a new due date and a note; nothing else changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-25T09:00:00Z'));
    const s = await seed();
    const before = await stored(s.invoice.id);

    const res = await svc.updateInvoice(
      s.actor,
      s.invoice.id,
      formFrom(before, { dueDate: '2026-04-01', notes: 'Extended', paymentTerms: 'Net 7', poNumber: 'PO-9' })
    );

    expect(res.success).toBe(true);
    expect(res.data.derivedOverdue).toBe(false);
    const after = await stored(s.invoice.id);
    expect(after).toMatchObject({
      dueDate: day('2026-04-01'),
      notes: 'Extended',
      paymentTerms: 'Net 7',
      poNumber: 'PO-9',
      status: 'PENDING',
      version: 3,
    });
    expect(locked(after)).toEqual(locked(before));
  });

  it('AC-07: a hand-marked OVERDUE invoice stays OVERDUE when its due date moves into the future', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-20T09:00:00Z'));
    const s = await seed({ status: 'OVERDUE' });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { dueDate: '2026-04-30' }));
    expect(res.success).toBe(true);
    expect((await stored(s.invoice.id)).status).toBe('OVERDUE');
  });

  it.each([
    ['invoiceNumber', { invoiceNumber: 'INV-2025-0099' }],
    ['issueDate', { issueDate: '2026-03-11' }],
    ['currency', { currency: 'EUR' }],
    ['taxRate', { taxRate: 21 }],
    ['discount', { discount: 0 }],
    ['shipping', { shipping: 6 }],
    ['terms', { terms: 'Net 30' }],
  ])('AC-08: a changed %s is refused with ISSUED_INVOICE_LOCKED and nothing is stored', async (key, change) => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { ...change, notes: 'sneaky' }));
    expect(res).toEqual({
      success: false,
      code: 'VALIDATION',
      error: LOCKED_ERROR,
      fieldErrors: { [key]: [LOCKED] },
      details: { kind: 'ISSUED_INVOICE_LOCKED' },
    });
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-08: a changed Customer, sender profile, bank account or line is refused under its key', async () => {
    const s = await seed();
    const otherCustomer = await createCustomer(prisma, s.user.id, { name: 'Other' });
    const otherProfile = await createSenderProfile(prisma, s.user.id);
    const otherAccount = await createBankAccount(prisma, s.senderProfile.id);
    const before = await stored(s.invoice.id);
    const form = formFrom(before);

    const cases: Array<[string, Record<string, unknown>]> = [
      ['customerId', { customerId: otherCustomer.id }],
      ['senderProfileId', { senderProfileId: otherProfile.id }],
      ['bankAccountId', { bankAccountId: otherAccount.id }],
      ['items.0.price', { items: [{ ...form.items[0], price: 151 }, form.items[1]] }],
      ['items.1.description', { items: [form.items[0], { ...form.items[1], description: 'March' }] }],
      ['items', { items: [form.items[0]] }],
    ];
    for (const [key, change] of cases) {
      const res = await svc.updateInvoice(s.actor, s.invoice.id, { ...form, ...change });
      expect(res, key).toMatchObject({ code: 'VALIDATION', fieldErrors: { [key]: [LOCKED] }, details: { kind: 'ISSUED_INVOICE_LOCKED' } });
    }
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-08: an unedited legacy issue-date instant and a "150" vs 150.00 price count as unchanged', async () => {
    const s = await seed({ issueDate: new Date('2026-03-10T12:34:00Z') });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'ok' }));
    expect(res.success).toBe(true);
    expect((await stored(s.invoice.id)).issueDate).toEqual(new Date('2026-03-10T12:34:00Z'));
  });

  it('AC-08: a legacy issue-date instant the editor loaded, normalised since, still counts as unchanged', async () => {
    // Loaded as 2026-03-09T22:00Z (Kyiv midnight 10 Mar), shown as its UTC day 9 Mar; the row was then
    // normalised to 10 Mar by a zone write. The save sends 9 Mar with the loaded instant.
    const s = await seed({ issueDate: day('2026-03-10') });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(
      s.actor,
      s.invoice.id,
      formFrom(before, { issueDate: '2026-03-09', loadedIssueDate: '2026-03-09T22:00:00.000Z', notes: 'ok' })
    );
    expect(res.success).toBe(true);
    expect((await stored(s.invoice.id)).issueDate).toEqual(day('2026-03-10'));
  });

  it('AC-09: a due date of 5 March on an invoice issued 10 March is refused on the due date', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { dueDate: '2026-03-05' }));
    expect(res).toMatchObject({
      success: false,
      code: 'VALIDATION',
      fieldErrors: { dueDate: ["The due date can't be before the issue date (10 Mar 2026)."] },
    });
    expect(await stored(s.invoice.id)).toEqual(before);
    const same = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { dueDate: '2026-03-10' }));
    expect(same.success).toBe(true);
  });

  it('AC-14: an issued invoice whose currency differs from its bank account saves its notes', async () => {
    const s = await seed({ currency: 'EUR', discount: 400 });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'legacy note' }));
    expect(res.success).toBe(true);
    expect((await stored(s.invoice.id)).notes).toBe('legacy note');
  });

  it('AC-14 (T23): a legacy PENDING invoice with a negative tax rate and a zero quantity saves a notes-only edit', async () => {
    const s = await seed({ taxRate: -5 });
    await prisma.invoiceItem.updateMany({ where: { invoiceId: s.invoice.id }, data: { quantity: 0, rate: -3 } });
    await prisma.invoice.update({ where: { id: s.invoice.id }, data: { shipping: -2 } });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'still saves' }));
    expect(res).toMatchObject({ success: true });
    expect((await stored(s.invoice.id)).notes).toBe('still saves');
  });

  it('AC-14/AC-19 (T23): a draft save with a negative price or a zero quantity is VALIDATION on the line, nothing stored', async () => {
    const s = await seed({ status: 'DRAFT' });
    const before = await stored(s.invoice.id);
    const form = formFrom(before);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, {
      ...form,
      taxRate: -1,
      items: form.items.map((item, i) => (i === 0 ? { ...item, price: -3 } : { ...item, quantity: 0 })),
    });
    expect(res).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(res.fieldErrors).toHaveProperty(['items.0.price']);
    expect(res.fieldErrors).toHaveProperty(['items.1.quantity']);
    expect(res.fieldErrors).toHaveProperty(['taxRate']);
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-20b (T23): a draft discount above 99,999,999.99 is a discount field error, never FAILED', async () => {
    const s = await seed({ status: 'DRAFT' });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { discount: 100_000_000 }));
    expect(res).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(res.fieldErrors?.discount).toContain("Discount can't exceed 99,999,999.99.");
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-06: a cancelled invoice refuses even a notes-only save, suggesting a duplicate', async () => {
    const s = await seed({ status: 'CANCELLED' });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'x' }));
    expect(res).toEqual({
      success: false,
      code: 'VALIDATION',
      error: CANCELLED,
      details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'CANCELLED', suggestion: 'DUPLICATE' },
    });
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('AC-10: an outdated loadedVersion is CONFLICT before any other rule, even with a locked change', async () => {
    const s = await seed({ status: 'CANCELLED' });
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { loadedVersion: 1, currency: 'EUR' }));
    expect(res).toEqual({
      success: false,
      code: 'CONFLICT',
      error: CHANGED_ELSEWHERE,
      details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 2 },
    });
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it('lifecycle: PAID → DRAFT from the editor is refused with CANCEL_AND_DUPLICATE; PENDING → PAID records paidAt', async () => {
    const s = await seed({ status: 'PAID', paidAt: new Date('2026-03-12T10:00:00Z') });
    const paid = await stored(s.invoice.id);
    const back = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(paid, { status: 'DRAFT' }));
    expect(back).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { status: ['An issued invoice can never return to draft. Cancel it and duplicate it instead.'] },
      details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'PAID', suggestion: 'CANCEL_AND_DUPLICATE' },
    });

    const t = await seed();
    const pending = await stored(t.invoice.id);
    const res = await svc.updateInvoice(t.actor, t.invoice.id, formFrom(pending, { status: 'PAID' }));
    expect(res.success).toBe(true);
    expect(res.data.paidAt).toEqual(expect.any(String));
    expect((await stored(t.invoice.id)).status).toBe('PAID');
  });

  it('two locked fields and a bad due date → ISSUED_INVOICE_LOCKED with both keys, the due-date rule not reached', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(
      s.actor,
      s.invoice.id,
      formFrom(before, { taxRate: 0, shipping: 0, dueDate: '2026-03-01' })
    );
    expect(res.fieldErrors).toEqual({ taxRate: [LOCKED], shipping: [LOCKED] });
  });

  it('a missing loadedVersion is VALIDATION on loadedVersion', async () => {
    const s = await seed();
    const before = await stored(s.invoice.id);
    const form: Record<string, unknown> = formFrom(before);
    delete form.loadedVersion;
    const res = await svc.updateInvoice(s.actor, s.invoice.id, form);
    expect(res).toMatchObject({ code: 'VALIDATION', fieldErrors: { loadedVersion: ['Reload the invoice and try again.'] } });
  });

  it("another Freelancer's invoice is NOT_FOUND", async () => {
    const s = await seed();
    const other = await createFreelancer(prisma);
    const otherActor = await actingFreelancerForTest(other.id, 'UTC');
    const before = await stored(s.invoice.id);
    const res = await svc.updateInvoice(otherActor, s.invoice.id, formFrom(before, { notes: 'x' }));
    expect(res).toEqual({ success: false, code: 'NOT_FOUND', error: 'Invoice not found.' });
  });
});

describe.runIf(!containerRuntimeAvailable)('updateInvoice on an issued invoice (T08)', () => {
  it.skip('skipped: no container runtime', () => {});
});
