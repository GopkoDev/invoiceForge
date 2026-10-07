// invoice-integrity T21 (spec.md §6 NFR "Concurrent saves"; §5 AC-10; sad.md §10 QG-2b, §6 flow 2) — an
// outdated editor save racing a status change from the list: 50 runs with both writes released
// together. Whichever commits first, no status or payment-date change is lost: when the list wins,
// the editor save is CHANGED_ELSEWHERE and stores nothing; when the editor wins, its notes are saved
// and the status change still applies on top.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const RUNS = 50;
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe.runIf(containerRuntimeAvailable)('outdated editor save vs a list status change (T21, QG-2b)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: typeof import('@/lib/services/invoices/invoices');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/invoices/invoices');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it(`${RUNS} races lose no status or payment-date change`, async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const senderProfile = await createSenderProfile(prisma, user.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id);

    const outcomes = { editorFirst: 0, listFirst: 0 };
    for (let run = 0; run < RUNS; run++) {
      const invoice = await createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        items: [{ name: 'Work', quantity: 1, rate: 100, amount: 100 }],
        overrides: {
          invoiceNumber: `RACE-${run}`,
          status: 'PENDING',
          dueDate: new Date('2999-01-10T00:00:00.000Z'),
          version: 3,
        },
      });
      // The editor was opened at version 3 and saves a note; the list marks the invoice paid.
      const editorSave = {
        invoiceNumber: invoice.invoiceNumber,
        status: 'PENDING' as const,
        senderProfileId: invoice.senderProfileId,
        bankAccountId: invoice.bankAccountId,
        customerId: invoice.customerId,
        issueDate: iso(invoice.issueDate),
        dueDate: iso(invoice.dueDate),
        currency: invoice.currency,
        items: invoice.items.map((item) => ({
          id: item.id,
          productName: item.name,
          description: '',
          unit: item.unit,
          quantity: Number(item.quantity),
          price: Number(item.rate),
          total: Number(item.amount),
        })),
        notes: `editor ${run}`,
        loadedVersion: 3,
      };

      const [list, editor] = await Promise.all([
        svc.updateInvoiceStatus(actor, invoice.id, 'PAID'),
        svc.updateInvoice(actor, invoice.id, editorSave),
      ]);
      const final = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

      // The list change is never lost.
      expect(list, `run ${run}`).toMatchObject({ success: true, data: { status: 'PAID' } });
      expect(final.status, `run ${run}`).toBe('PAID');
      expect(final.paidAt, `run ${run}`).not.toBeNull();

      if (editor.success) {
        // The editor committed first: its note is saved and the status change applied on top.
        outcomes.editorFirst++;
        expect(final.notes).toBe(`editor ${run}`);
        expect(final.version).toBe(5);
      } else {
        // The list committed first: the outdated editor save is refused and stores nothing.
        outcomes.listFirst++;
        expect(editor).toEqual({
          success: false,
          code: 'CONFLICT',
          error: 'This invoice was changed elsewhere after you opened it. Reload it to see the latest version.',
          details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 4 },
        });
        expect(final.notes).toBeNull();
        expect(final.version).toBe(4);
      }
    }
    expect(outcomes.editorFirst + outcomes.listFirst).toBe(RUNS);
  }, 120_000);
});

describe.runIf(!containerRuntimeAvailable)('outdated editor save vs a list status change (T21)', () => {
  it.skip('skipped: no container runtime', () => {});
});
