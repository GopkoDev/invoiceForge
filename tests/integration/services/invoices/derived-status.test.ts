// T07 (spec.md §5 AC-24; ADR-0005) — every invoice read returns the derived status, the status
// filters use the shared overdue rule, and a date-overdue invoice refuses OVERDUE/PENDING while
// PAID still works. The stored status is never written by a read.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { withLoadedVersion } from '../../../support/loaded-version';
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
type Saver = { updateInvoice: (a: unknown, id: string, data: unknown) => Promise<Result> };

const PAST = new Date('2020-01-10T00:00:00.000Z');
const FUTURE = new Date('2999-01-10T00:00:00.000Z');
const D6 = 'This invoice is overdue because its due date has passed. You can still mark it paid.';

describe.runIf(containerRuntimeAvailable)('derived invoice status (T07, AC-24)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let editor: Editor;
  let saver: Saver;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/invoices/invoices')) as unknown as Svc;
    editor = (await import('@/lib/services/invoices/editor-data')) as unknown as Editor;
    // invoice-integrity T08: saves carry the row's current version, as a freshly opened editor would.
    const raw = svc as unknown as Saver;
    saver = {
      updateInvoice: async (a, id, data) =>
        raw.updateInvoice(a, id, await withLoadedVersion(prisma, id, data as object)),
    };
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
    // The editor gets the stored status; the derived badge travels beside it (F-01, T26).
    const loaded = (await editor.getInvoiceEditorData(s.actor, late.id)).data;
    expect(loaded.initialData.status).toBe('PENDING');
    expect(loaded.derivedOverdue).toBe(true);
    expect((await editor.getInvoiceEditorData(s.actor, ontime.id)).data.derivedOverdue).toBe(false);
    expect(await stored(late.id)).toBe('PENDING');
  });

  // What the editor sends back: the loaded initialData, days as yyyy-MM-dd.
  const asPayload = (initialData: any, overrides: Record<string, unknown> = {}) => ({
    ...initialData,
    issueDate: initialData.issueDate.toISOString().slice(0, 10),
    dueDate: initialData.dueDate.toISOString().slice(0, 10),
    ...overrides,
  });

  it('an editor save of a past-due pending invoice keeps the stored status PENDING (F-01)', async () => {
    const s = await seed();
    const late = await s.make({ status: 'PENDING', dueDate: PAST });
    const { initialData } = (await editor.getInvoiceEditorData(s.actor, late.id)).data;

    const saved = await saver.updateInvoice(s.actor, late.id, asPayload(initialData, { notes: 'edited' }));
    expect(saved).toMatchObject({ success: true, data: { status: 'PENDING', derivedOverdue: true } });
    expect(await stored(late.id)).toBe('PENDING');
    expect((await svc.getInvoice(s.actor, late.id)).data.status).toBe('OVERDUE');

    // Moving the due date into the future makes it not overdue: it was never stored as overdue.
    const moved = await saver.updateInvoice(s.actor, late.id, asPayload(initialData, { dueDate: '2999-01-10' }));
    expect(moved).toMatchObject({ success: true, data: { status: 'PENDING', derivedOverdue: false } });
    expect(await stored(late.id)).toBe('PENDING');
    expect((await svc.getInvoice(s.actor, late.id)).data.status).toBe('PENDING');
  });

  it('updateInvoice never persists a derived overdue status for a stored pending invoice', async () => {
    const s = await seed();
    const late = await s.make({ status: 'PENDING', dueDate: PAST });
    const { initialData } = (await editor.getInvoiceEditorData(s.actor, late.id)).data;

    // A client that still sends the derived status back (the pre-fix editor).
    const saved = await saver.updateInvoice(s.actor, late.id, asPayload(initialData, { status: 'OVERDUE' }));
    expect(saved.success).toBe(true);
    expect(await stored(late.id)).toBe('PENDING');
  });

  it('updateInvoice stores OVERDUE for a not-yet-due pending invoice, as before the derived status (G-04)', async () => {
    const s = await seed();
    const early = await s.make({ status: 'PENDING', dueDate: FUTURE });
    const { initialData } = (await editor.getInvoiceEditorData(s.actor, early.id)).data;

    const saved = await saver.updateInvoice(s.actor, early.id, asPayload(initialData, { status: 'OVERDUE' }));
    expect(saved.success).toBe(true);
    expect(await stored(early.id)).toBe('OVERDUE');
  });

  it('an editor save keeps a hand-marked overdue invoice overdue', async () => {
    const s = await seed();
    const hand = await s.make({ status: 'OVERDUE', dueDate: FUTURE });
    const { initialData } = (await editor.getInvoiceEditorData(s.actor, hand.id)).data;
    expect(initialData.status).toBe('OVERDUE');

    const saved = await saver.updateInvoice(s.actor, hand.id, asPayload(initialData, { notes: 'edited' }));
    expect(saved.success).toBe(true);
    expect(await stored(hand.id)).toBe('OVERDUE');
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
