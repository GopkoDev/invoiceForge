// T07 (spec.md §5 AC-24; ADR-0005) — every invoice read returns the derived status, the status
// filters use the shared overdue rule, and a date-overdue invoice refuses OVERDUE/PENDING while
// PAID still works. The stored status is never written by a read.
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
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

/* eslint-disable @typescript-eslint/no-explicit-any */
type Result = {
  success: boolean;
  code?: string;
  error?: string;
  data?: any;
};
type Svc = {
  listInvoices: (a: unknown, q?: unknown) => Promise<Result>;
  getInvoice: (a: unknown, id: string) => Promise<Result>;
  updateInvoiceStatus: (a: unknown, id: string, status: string) => Promise<Result>;
};
type Editor = { getInvoiceEditorData: (a: unknown, id?: string) => Promise<Result> };

const PAST = new Date('2020-01-10T00:00:00.000Z');
const FUTURE = new Date('2999-01-10T00:00:00.000Z');
const D6 = 'This invoice is overdue because its due date has passed. You can still mark it paid.';

describe.runIf(containerRuntimeAvailable)('derived invoice status (T07, AC-24)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let editor: Editor;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/invoices/invoices')) as unknown as Svc;
    editor = (await import('@/lib/services/invoices/editor-data')) as unknown as Editor;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed() {
    const user = await createFreelancer(prisma, { email: 't07@example.com' });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 9 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: 'Cust' });
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    let n = 0;
    const make = (overrides: Record<string, unknown>) =>
      seedInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        items: [{ name: 'W', unit: 'pcs', quantity: 1, rate: 100, amount: 100 }],
        overrides: { invoiceNumber: `1-INV-${++n}`, ...overrides } as never,
      });
    return { user, senderProfile, customer, actor, make };
  }
  const stored = async (id: string) =>
    (await prisma.invoice.findUniqueOrThrow({ where: { id } })).status;

  it('listInvoices returns OVERDUE for a past-due pending invoice, filters by the rule, and does not write', async () => {
    const s = await seed();
    const late = await s.make({ status: 'PENDING', dueDate: PAST });
    const ontime = await s.make({ status: 'PENDING', dueDate: FUTURE });
    const hand = await s.make({ status: 'OVERDUE', dueDate: FUTURE });
    const draft = await s.make({ status: 'DRAFT', dueDate: PAST });
    const cancelled = await s.make({ status: 'CANCELLED', dueDate: PAST });

    const all = await svc.listInvoices(s.actor, { pageSize: 50 });
    const byId = Object.fromEntries(all.data.items.map((i: any) => [i.id, i.status]));
    expect(byId).toEqual({
      [late.id]: 'OVERDUE',
      [ontime.id]: 'PENDING',
      [hand.id]: 'OVERDUE',
      [draft.id]: 'DRAFT',
      [cancelled.id]: 'CANCELLED',
    });

    const ids = (r: Result) => r.data.items.map((i: any) => i.id).sort();
    expect(ids(await svc.listInvoices(s.actor, { status: 'OVERDUE' }))).toEqual([late.id, hand.id].sort());
    expect(ids(await svc.listInvoices(s.actor, { status: 'PENDING' }))).toEqual([ontime.id]);

    // The status filter composes with search.
    const searched = await svc.listInvoices(s.actor, { status: 'OVERDUE', search: late.invoiceNumber });
    expect(ids(searched)).toEqual([late.id]);

    expect(await stored(late.id)).toBe('PENDING');
  });

  it('customer and sender-profile scoped lists return the derived status', async () => {
    const s = await seed();
    const late = await s.make({ status: 'PENDING', dueDate: PAST });
    const byCustomer = await svc.listInvoices(s.actor, { customerId: s.customer.id });
    const bySender = await svc.listInvoices(s.actor, { senderProfileId: s.senderProfile.id });
    expect(byCustomer.data.items.find((i: any) => i.id === late.id).status).toBe('OVERDUE');
    expect(bySender.data.items.find((i: any) => i.id === late.id).status).toBe('OVERDUE');
  });

  it('getInvoice and getInvoiceEditorData return the derived status without writing', async () => {
    const s = await seed();
    const late = await s.make({ status: 'PENDING', dueDate: PAST });
    const ontime = await s.make({ status: 'PENDING', dueDate: FUTURE });
    expect((await svc.getInvoice(s.actor, late.id)).data.status).toBe('OVERDUE');
    expect((await svc.getInvoice(s.actor, ontime.id)).data.status).toBe('PENDING');
    expect((await editor.getInvoiceEditorData(s.actor, late.id)).data.initialData.status).toBe('OVERDUE');
    expect(await stored(late.id)).toBe('PENDING');
  });

  it('updateInvoiceStatus refuses OVERDUE and PENDING on a date-overdue invoice, PAID still works', async () => {
    const s = await seed();
    const late = await s.make({ status: 'PENDING', dueDate: PAST });
    for (const next of ['OVERDUE', 'PENDING']) {
      const res = await svc.updateInvoiceStatus(s.actor, late.id, next);
      expect(res).toMatchObject({ success: false, code: 'VALIDATION', error: D6 });
      expect(await stored(late.id)).toBe('PENDING');
    }
    const paid = await svc.updateInvoiceStatus(s.actor, late.id, 'PAID');
    expect(paid.success).toBe(true);
    expect(await stored(late.id)).toBe('PAID');
  });

  it('a hand-marked OVERDUE invoice that is not yet due can go back to pending', async () => {
    const s = await seed();
    const hand = await s.make({ status: 'OVERDUE', dueDate: FUTURE });
    const res = await svc.updateInvoiceStatus(s.actor, hand.id, 'PENDING');
    expect(res).toMatchObject({ success: true, data: { status: 'PENDING' } });
    expect(await stored(hand.id)).toBe('PENDING');
  });
});
