// invoice-integrity T14 (spec.md §6 NFR "PDF fidelity"; §5 AC-01, AC-03, AC-16; ADR-0001) — 100 % of
// issued fixture invoices print identical PDF text before and after their sender profile, Customer
// and bank account change. Text, not bytes: the logo stays current (spec §3).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import type { InvoiceStatus, PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createCustomer } from '../../../support/factories/customer';
import { createProduct } from '../../../support/factories/product';
import { createInvoice } from '../../../support/factories/invoice';
import { pdfTextRuns } from '../../../support/pdf-text';
import { buildInvoiceDocument } from '@/lib/invoice-document';
import { formatMoney } from '@/lib/format';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

type Invoices = typeof import('@/lib/services/invoices/invoices');
type PdfDocument = typeof import('@/lib/pdf/invoice-pdf-kit');

describe.runIf(containerRuntimeAvailable)('PDF fidelity of issued invoices (T14)', () => {
  let db: TestDatabase;
  let invoices: Invoices;
  let pdfDocument: PdfDocument;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    invoices = await import('@/lib/services/invoices/invoices');
    pdfDocument = await import('@/lib/pdf/invoice-pdf-kit');
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(testClient);
  });

  async function printedText(actor: Awaited<ReturnType<typeof actingFreelancerForTest>>, id: string) {
    const result = await invoices.getInvoice(actor, id);
    if (!result.success) throw new Error(result.error);
    const inv = result.data;
    return pdfTextRuns(
      createElement(pdfDocument.InvoicePDFDocument, {
        document: buildInvoiceDocument({ kind: 'issued', invoice: inv }),
      })
    );
  }

  it('every issued fixture prints the same text after its sender profile, Customer and bank account change', async () => {
    const user = await createFreelancer(testClient);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const profile = await createSenderProfile(testClient, user.id, {
      name: 'Studio',
      legalName: 'Old Legal LLC',
      address: '1 Old St',
      taxId: 'TAX-1',
    });
    const customer = await createCustomer(testClient, user.id, { name: 'Acme', address: '2 Old Road' });
    const withIban = await createBankAccount(testClient, profile.id, {
      bankName: 'Old Bank',
      accountName: 'Old Holder',
      accountNumber: 'ACC-0001',
      iban: 'UA21 OLD',
      swift: 'OLDSWIFT',
    });
    const noIban = await createBankAccount(testClient, profile.id, {
      bankName: 'Plain Bank',
      accountName: 'Plain Holder',
      accountNumber: 'ACC-0002',
    });
    const product = await createProduct(testClient, user.id, { name: 'Retired service' });

    const statuses: InvoiceStatus[] = ['PENDING', 'OVERDUE', 'PAID', 'CANCELLED'];
    const fixtures = [];
    let n = 1;
    for (const status of statuses) {
      for (const bankAccount of [withIban, noIban]) {
        fixtures.push(
          await createInvoice(testClient, {
            senderProfile: profile,
            customer,
            bankAccount,
            items: [
              { productId: product.id, name: 'Retired service', description: 'Audit', quantity: 2, rate: 50, amount: 100 },
              { name: 'Free text line', quantity: 1, rate: 25, amount: 25 },
            ],
            overrides: { invoiceNumber: `FX-${n++}`, status, paidAt: status === 'PAID' ? new Date() : null },
          })
        );
      }
    }

    const before = new Map<string, string[]>();
    for (const inv of fixtures) before.set(inv.id, await printedText(actor, inv.id));

    // The printed bank block: account number always, IBAN/SWIFT only when present (AC-03).
    const ibanText = before.get(fixtures[0].id)!;
    expect(ibanText).toEqual(
      expect.arrayContaining(['Old Bank', 'Old Holder', 'Account number: ACC-0001', 'IBAN: UA21 OLD', 'SWIFT: OLDSWIFT'])
    );
    const plainText = before.get(fixtures[1].id)!;
    expect(plainText).toEqual(expect.arrayContaining(['Plain Bank', 'Plain Holder', 'Account number: ACC-0002']));
    expect(plainText.join('\n')).not.toMatch(/IBAN|SWIFT/);
    expect(ibanText).toEqual(expect.arrayContaining(['Old Legal LLC', '1 Old St', '2 Old Road']));

    // Change everything the PDF used to read live; delete the product (its lines become free text).
    await testClient.senderProfile.update({
      where: { id: profile.id },
      data: { name: 'Renamed', legalName: 'New Legal Ltd', address: '9 New St', taxId: 'TAX-9' },
    });
    await testClient.customer.update({ where: { id: customer.id }, data: { name: 'Acme 2', address: '9 New Road' } });
    await testClient.bankAccount.update({
      where: { id: withIban.id },
      data: { bankName: 'New Bank', accountName: 'New Holder', accountNumber: 'ACC-9', iban: 'UA99 NEW', swift: 'NEWSWIFT' },
    });
    await testClient.bankAccount.update({ where: { id: noIban.id }, data: { iban: 'UA77 ADDED' } });
    await testClient.product.delete({ where: { id: product.id } });

    let identical = 0;
    for (const inv of fixtures) {
      const after = await printedText(actor, inv.id);
      expect(after, `PDF text of ${inv.invoiceNumber}`).toEqual(before.get(inv.id));
      identical++;
    }
    expect(identical).toBe(fixtures.length);
    // The deleted product's line still prints, as free text, with an unchanged total (AC-16).
    expect(await printedText(actor, fixtures[0].id)).toEqual(
      expect.arrayContaining(['Retired service', 'Audit', '$100.00', '$125.00'])
    );
  });

  // editor-ux T23 (AC-10; review 2026-10-10 D3): a legacy issued invoice prints its stored amounts.
  it('an issued invoice whose stored total differs from a recompute prints the stored total, as the list shows', async () => {
    const user = await createFreelancer(testClient);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const profile = await createSenderProfile(testClient, user.id, { name: 'Studio' });
    const customer = await createCustomer(testClient, user.id, { name: 'Acme' });
    const bank = await createBankAccount(testClient, profile.id, { currency: 'USD' });
    const inv = await createInvoice(testClient, {
      senderProfile: profile,
      customer,
      bankAccount: bank,
      items: [{ name: 'Legacy line', quantity: 2, rate: 617.25, amount: 1000 }],
      overrides: {
        invoiceNumber: 'LEG-1',
        status: 'PENDING',
        currency: 'USD',
        subtotal: 1000,
        taxRate: 10,
        taxAmount: 77,
        total: 1077,
      },
    });

    const read = await invoices.getInvoice(actor, inv.id);
    if (!read.success) throw new Error(read.error);
    const doc = buildInvoiceDocument({ kind: 'issued', invoice: read.data });

    const listed = await invoices.listInvoices(actor, {});
    if (!listed.success) throw new Error(listed.error);
    const row = listed.data.items.find((i) => i.id === inv.id)!;
    const listTotal = formatMoney(Number(row.total), 'USD');

    expect(listTotal).toBe(formatMoney(1077, 'USD'));
    expect(doc.total.value).toBe(listTotal);
    expect(doc.lines[0].amount).toBe(formatMoney(1000, 'USD'));
    const text = pdfTextRuns(createElement(pdfDocument.InvoicePDFDocument, { document: doc })).join(' ');
    expect(text).toContain(listTotal);
    expect(text).not.toContain(formatMoney(1357.95, 'USD'));
  });
});

describe.runIf(!containerRuntimeAvailable)('PDF fidelity of issued invoices (T14)', () => {
  it.skip('skipped: no container runtime', () => {});
});
