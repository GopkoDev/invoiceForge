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

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

type Invoices = typeof import('@/lib/services/invoices/invoices');
type PdfHelpers = typeof import('@/lib/helpers/invoice-pdf-helpers');
type PdfDocument = typeof import('@/components/invoice-editor/invoice-pdf-document');

describe.runIf(containerRuntimeAvailable)('PDF fidelity of issued invoices (T14)', () => {
  let db: TestDatabase;
  let invoices: Invoices;
  let helpers: PdfHelpers;
  let pdfDocument: PdfDocument;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    invoices = await import('@/lib/services/invoices/invoices');
    helpers = await import('@/lib/helpers/invoice-pdf-helpers');
    pdfDocument = await import('@/components/invoice-editor/invoice-pdf-document');
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
    const data = helpers.prepareInvoiceDataForPdf(inv);
    return pdfTextRuns(
      createElement(pdfDocument.InvoicePDFDocument, {
        formData: data.formData,
        senderProfile: data.senderProfile ?? undefined,
        customer: data.customer ?? undefined,
        bankAccount: data.bankAccount ?? undefined,
        subtotal: inv.subtotal,
        taxAmount: inv.taxAmount,
        total: inv.total,
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
      expect.arrayContaining(['Retired service', 'Audit', '100.00 USD', '125.00 USD'])
    );
  });
});

describe.runIf(!containerRuntimeAvailable)('PDF fidelity of issued invoices (T14)', () => {
  it.skip('skipped: no container runtime', () => {});
});
