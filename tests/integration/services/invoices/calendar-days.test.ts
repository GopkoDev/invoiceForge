// T25 (spec.md §1 "a due date is a calendar day … without any shift", §5 AC-12, AC-14, AC-15, AC-23,
// AC-23b, AC-24; review-2026-10-05 F-02, F-03) — an issue or due date is stored as the picked day at
// T00:00:00Z, and the overdue rule and every period compare by calendar day. Through the real
// business layer on a throwaway database.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { addInvoice, seedFreelancer } from '../dashboard/harness';
import { storedDayToLocalDate } from '@/lib/helpers/calendar-day';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));

type Svc = typeof import('@/lib/services/invoices/invoices');
type Find = typeof import('@/lib/services/invoices/find-by-reference');
type Search = typeof import('@/lib/services/invoices/assistant-search');
type Reads = typeof import('@/lib/services/dashboard/assistant-reads');
type Dash = typeof import('@/lib/services/dashboard/dashboard');
type Helpers = typeof import('@/store/invoice-editor-store/helpers');

function data<T>(r: { success: true; data: T } | { success: false; code: string; error: string }): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

const KYIV = 'Europe/Kyiv';
const NEW_YORK = 'America/New_York';
const ORIGINAL_TZ = process.env.TZ;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.runIf(containerRuntimeAvailable)('calendar-day storage and comparison (T25)', () => {
  let db: TestDatabase;
  let svc: Svc;
  let find: Find;
  let search: Search;
  let reads: Reads;
  let dash: Dash;
  let helpers: Helpers;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/invoices/invoices');
    find = await import('@/lib/services/invoices/find-by-reference');
    search = await import('@/lib/services/invoices/assistant-search');
    reads = await import('@/lib/services/dashboard/assistant-reads');
    dash = await import('@/lib/services/dashboard/dashboard');
    helpers = await import('@/store/invoice-editor-store/helpers');
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
    await truncateAllTables(testClient);
  });

  function clock(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  }

  /** What the editor sends: its form holds local Dates, which it turns into days on save. */
  function editorForm(s: Awaited<ReturnType<typeof seedFreelancer>>, issueDate: Date, dueDate: Date) {
    return helpers.toSavePayload({
      invoiceNumber: '',
      status: 'PENDING',
      senderProfileId: s.profileId,
      bankAccountId: s.bank.USD.id,
      customerId: s.customer.id,
      issueDate,
      dueDate,
      currency: 'USD',
      poNumber: '',
      paymentTerms: '',
      items: [{ id: 'item-0', productId: '', productName: 'Widget', description: '', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      taxRate: 0,
      discount: 0,
      shipping: 0,
      notes: '',
      terms: '',
    });
  }

  it('AC-12/AC-23b/AC-24: a due date picked as local midnight in Europe/Kyiv is stored as that day, is not overdue on it and reports it', async () => {
    process.env.TZ = KYIV;
    clock('2026-10-15T09:00:00Z'); // 12:00 on 15 Oct in Kyiv
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const picked = new Date(2026, 9, 15); // the Calendar's value: Kyiv local midnight = 2026-10-14T21:00Z
    expect(picked.toISOString()).toBe('2026-10-14T21:00:00.000Z');

    const created = data(await svc.createInvoice(actor, editorForm(s, new Date(2026, 9, 1), picked)));
    const stored = await testClient.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(stored.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');

    const onDueDay = data(await find.findInvoiceByReference(actor, { invoiceId: created.id }));
    expect(onDueDay).toMatchObject({ status: 'pending', daysOverdue: null, dueDate: '2026-10-15', issueDate: '2026-10-01' });
    const rows = data(await search.searchInvoicesForAssistant(actor, {})).rows;
    expect(rows[0]).toMatchObject({ dueDate: '2026-10-15', status: 'pending', daysOverdue: null });

    clock('2026-10-16T09:00:00Z');
    const nextDay = data(await find.findInvoiceByReference(actor, { invoiceId: created.id }));
    expect(nextDay).toMatchObject({ status: 'overdue', daysOverdue: 1, dueDate: '2026-10-15' });
  });

  it('AC-12/AC-23b: updateInvoice stores the picked day the same way', async () => {
    process.env.TZ = KYIV;
    clock('2026-10-15T09:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const created = data(await svc.createInvoice(actor, editorForm(s, new Date(2026, 9, 1), new Date(2026, 9, 20))));

    data(await svc.updateInvoice(actor, created.id, { ...editorForm(s, new Date(2026, 9, 2), new Date(2026, 9, 15)), invoiceNumber: (await testClient.invoice.findUniqueOrThrow({ where: { id: created.id } })).invoiceNumber }));
    const stored = await testClient.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.issueDate.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(stored.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('T40 (H-01): a notes-only save keeps an unedited legacy due date, so the zone saved afterwards still yields 15 Oct', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const noZone = await actingFreelancerForTest(s.userId);
    const legacyDue = new Date('2026-10-14T21:00:00.000Z'); // Kyiv local midnight 15 Oct, written before the release
    const legacyIssue = new Date('2026-09-30T21:00:00.000Z'); // Kyiv local midnight 1 Oct
    const inv = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 100, issueDate: legacyIssue, dueDate: legacyDue });
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });

    // No saved zone: the editor shows the UTC days (1 Oct, 14 Oct) and the user edits only the notes.
    data(await svc.updateInvoice(noZone, inv.id, {
      ...editorForm(s, new Date(2026, 8, 30), new Date(2026, 9, 14)),
      invoiceNumber: before.invoiceNumber,
      notes: 'only the notes changed',
    }));
    const afterSave = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(afterSave.notes).toBe('only the notes changed');
    expect(afterSave.dueDate.toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(afterSave.issueDate.toISOString()).toBe('2026-09-30T21:00:00.000Z');

    const profile = await import('@/lib/services/profile/profile');
    await profile.updateTimeZone(noZone, KYIV);
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  /** The editor was built from these legacy instants (Kyiv local midnights of 1 Oct and 15 Oct). */
  const LEGACY_ISSUE = '2026-09-30T21:00:00.000Z';
  const LEGACY_DUE = '2026-10-14T21:00:00.000Z';
  const legacyInvoice = (s: Awaited<ReturnType<typeof seedFreelancer>>) =>
    addInvoice(s, { currency: 'USD', status: 'PENDING', total: 100, issueDate: new Date(LEGACY_ISSUE), dueDate: new Date(LEGACY_DUE) });
  /** A notes-only save from an editor that showed the UTC days 1 Oct / 14 Oct and loaded the legacy instants. */
  const notesOnlySave = (s: Awaited<ReturnType<typeof seedFreelancer>>, invoiceNumber: string, over: Record<string, unknown> = {}) => ({
    ...editorForm(s, new Date(2026, 8, 30), new Date(2026, 9, 14)),
    invoiceNumber,
    notes: 'only the notes changed',
    loadedIssueDate: LEGACY_ISSUE,
    loadedDueDate: LEGACY_DUE,
    ...over,
  } as never);

  it('T44 (I-01): the zone is seeded after the editor loaded the legacy dates; a notes-only save keeps the normalised 1 Oct / 15 Oct', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const profile = await import('@/lib/services/profile/profile');
    expect(await profile.seedTimeZoneIfEmpty(s.userId, KYIV)).toBe(true); // router.refresh() render, after the editor loaded
    const normalised = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(normalised.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');

    const actor = await actingFreelancerForTest(s.userId, KYIV);
    data(await svc.updateInvoice(actor, inv.id, notesOnlySave(s, before.invoiceNumber)));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.notes).toBe('only the notes changed');
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('T44 (I-01): stale tab - the zone was saved by another request after this tab loaded; the save keeps the normalised days', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const noZone = await actingFreelancerForTest(s.userId);
    const profile = await import('@/lib/services/profile/profile');
    await profile.updateTimeZone(noZone, KYIV); // another tab / request

    data(await svc.updateInvoice(noZone, inv.id, notesOnlySave(s, before.invoiceNumber)));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('T44 (I-01): a date the user really edited is still written, even after the zone was seeded', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const profile = await import('@/lib/services/profile/profile');
    await profile.seedTimeZoneIfEmpty(s.userId, KYIV);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    // Due moved from the loaded 14 Oct to 20 Oct; the issue date is untouched.
    data(await svc.updateInvoice(actor, inv.id, notesOnlySave(s, before.invoiceNumber, {
      dueDate: '2026-10-20',
    })));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.dueDate.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('T44 (I-01): a malformed loaded date is a VALIDATION failure and writes nothing', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const actor = await actingFreelancerForTest(s.userId);
    const r = await svc.updateInvoice(actor, inv.id, notesOnlySave(s, before.invoiceNumber, { dueDate: '2026-12-31', loadedDueDate: 'not a date' }));
    expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
    const after = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.dueDate.toISOString()).toBe(LEGACY_DUE);
  });

  it('T44 (I-01): a forged valid loaded instant whose day equals the submitted day only keeps the stored value', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const profile = await import('@/lib/services/profile/profile');
    await profile.seedTimeZoneIfEmpty(s.userId, KYIV); // the row is now 2026-10-15T00:00Z
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    data(await svc.updateInvoice(actor, inv.id, notesOnlySave(s, before.invoiceNumber, { dueDate: '2026-12-30', loadedDueDate: '2026-12-30T21:00:00.000Z' })));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z'); // kept, not 2026-12-30
  });

  it('T44 (I-01): a forged loaded instant whose day differs from the submitted day writes only the submitted day', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const profile = await import('@/lib/services/profile/profile');
    await profile.seedTimeZoneIfEmpty(s.userId, KYIV);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    data(await svc.updateInvoice(actor, inv.id, notesOnlySave(s, before.invoiceNumber, { dueDate: '2026-12-31', loadedDueDate: '2026-12-30T21:00:00.000Z' })));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.dueDate.toISOString()).toBe('2026-12-31T00:00:00.000Z'); // the submitted day, never the loaded instant
  });

  it('T44 (I-01, review): a second notes-only save in the same editor session still keeps the normalised dates', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const profile = await import('@/lib/services/profile/profile');
    await profile.seedTimeZoneIfEmpty(s.userId, KYIV); // after the editor loaded
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const first = data(await svc.updateInvoice(actor, inv.id, notesOnlySave(s, before.invoiceNumber)));
    expect(first.dueDate).toBe('2026-10-15T00:00:00.000Z');
    expect(first.issueDate).toBe('2026-10-01T00:00:00.000Z');

    // What the store does after a save: show the saved days and send the saved instants as the loaded ones.
    const second = data(await svc.updateInvoice(actor, inv.id, {
      ...editorForm(s, storedDayToLocalDate(first.issueDate), storedDayToLocalDate(first.dueDate)),
      invoiceNumber: before.invoiceNumber,
      notes: 'second save',
      loadedIssueDate: first.issueDate,
      loadedDueDate: first.dueDate,
    } as never));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.notes).toBe('second save');
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(second.dueDate).toBe('2026-10-15T00:00:00.000Z');
  });

  it('T44 (I-01, review): stale tab - save 1 keeps the legacy value, another tab seeds the zone, save 2 keeps the normalised days', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const noZone = await actingFreelancerForTest(s.userId);
    const first = data(await svc.updateInvoice(noZone, inv.id, notesOnlySave(s, before.invoiceNumber)));
    expect(first.dueDate).toBe(LEGACY_DUE); // kept: no zone yet
    const profile = await import('@/lib/services/profile/profile');
    await profile.updateTimeZone(noZone, KYIV); // another tab: normalises to 1 Oct / 15 Oct

    data(await svc.updateInvoice(noZone, inv.id, {
      ...editorForm(s, storedDayToLocalDate(first.issueDate), storedDayToLocalDate(first.dueDate)),
      invoiceNumber: before.invoiceNumber,
      notes: 'second save',
      loadedIssueDate: first.issueDate,
      loadedDueDate: first.dueDate,
    } as never));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  /** Waits until some other backend is blocked on a row lock (the save's FOR UPDATE), no sleeping. */
  async function waitForBlockedBackend(): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const rows = await testClient.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
      if (Number(rows[0].n) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('no backend ever blocked on the invoice row lock');
  }

  it('T44 (I-05): a zone write that normalises the dates while a save waits on the row lock is not overwritten (barrier on pg_stat_activity)', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const noZone = await actingFreelancerForTest(s.userId);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => { locked = resolve; });
    const normaliser = testClient.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Invoice" WHERE id = ${inv.id} FOR UPDATE`;
      locked();
      await gate;
      await tx.invoice.update({ where: { id: inv.id }, data: { issueDate: day('2026-10-01'), dueDate: day('2026-10-15') } });
    });
    await lockHeld;
    const saving = svc.updateInvoice(noZone, inv.id, notesOnlySave(s, before.invoiceNumber));
    await waitForBlockedBackend(); // the save has read the legacy row and is parked on the lock
    release();
    await normaliser;
    data(await saving);

    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.notes).toBe('only the notes changed');
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  }, 30_000);

  it('T44 (I-05): normalisation committed before the save read - the save keeps the normalised days', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await legacyInvoice(s);
    const before = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const noZone = await actingFreelancerForTest(s.userId);
    await testClient.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Invoice" WHERE id = ${inv.id} FOR UPDATE`;
      await tx.invoice.update({ where: { id: inv.id }, data: { issueDate: day('2026-10-01'), dueDate: day('2026-10-15') } });
    }); // committed; the save below starts afterwards

    data(await svc.updateInvoice(noZone, inv.id, notesOnlySave(s, before.invoiceNumber)));
    const final = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(final.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(final.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('T40 (H-05): the service refuses a Date for an issue or due date', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const form = editorForm(s, new Date(2026, 9, 1), new Date(2026, 9, 15));
    const r = await svc.createInvoice(actor, { ...form, dueDate: new Date('2026-10-14T21:00:00.000Z') } as never);
    expect(r.success).toBe(false);
    expect(await testClient.invoice.count()).toBe(0);
  });

  it('a duplicated invoice gets today and today + 30 days as calendar days in the owner zone', async () => {
    clock('2026-10-15T22:30:00Z'); // 01:30 on 16 Oct in Kyiv, 18:30 on 15 Oct in New York
    const s = await seedFreelancer(testClient, ['USD']);
    const original = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 10, issueDate: day('2026-09-01'), dueDate: day('2026-09-10') });
    const kyiv = await actingFreelancerForTest(s.userId, KYIV);
    const copy = data(await svc.duplicateInvoice(kyiv, original.id));
    const stored = await testClient.invoice.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored.issueDate.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(stored.dueDate.toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('AC-14/AC-15: an America/New_York this-month includes the invoice due on the 1st and excludes the 1st of next month; dashboard and Assistant agree', async () => {
    clock('2026-10-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const dueOn = (iso: string, total: number) =>
      addInvoice(s, { currency: 'USD', status: 'PENDING', total, issueDate: day('2026-09-20'), dueDate: day(iso) });
    await dueOn('2026-10-01', 100); // today is 15 Oct: the 1st is overdue, and counts in October
    const nov1 = await dueOn('2026-11-01', 200);
    const last = await dueOn('2026-10-31', 400);
    await dueOn('2026-09-30', 800); // overdue, due before the month
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);

    // The month, as the dashboard and the Assistant both read it.
    const period = { from: '2026-10-01', to: '2026-10-31' };
    const stats = data(await dash.getSummaryStats(actor, 'USD', period));
    // Planned (pending, not overdue) due in October: only the 31st. Overdue due in October: the 1st.
    expect(stats.plannedCount).toBe(1);
    expect(stats.totalPlanned).toBe(400);
    expect(stats.overdueCount).toBe(1);
    expect(stats.totalOverdue).toBe(100);

    const summary = data(await reads.getSummaryFiguresAllCurrencies(actor, { preset: 'this-month' }));
    expect(summary.period).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(summary.currencies[0].planned).toMatchObject({ total: '400.00', count: 1 });
    expect(summary.currencies[0].overdue).toMatchObject({ total: '100.00', count: 1 });

    const expected = data(await reads.listExpectedPaymentsPage(actor, { period: { preset: 'this-month' } }));
    expect(expected.rows.map((r) => r.invoiceId)).toEqual([last.id]);
    expect(expected.rows[0].dueDate).toBe('2026-10-31');

    // The 1st of November is in November (its UTC instant is 20:00 on 31 Oct in New York) and not in October.
    const nov = data(await reads.listExpectedPaymentsPage(actor, { period: { from: '2026-11-01', to: '2026-11-01' } }));
    expect(nov.rows.map((r) => r.invoiceId)).toEqual([nov1.id]);
  });

  it('AC-14: the Assistant due-date filters and the dashboard agree on the first and last day of a month for a New York owner', async () => {
    clock('2026-09-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const dueOn = (iso: string, total: number) =>
      addInvoice(s, { currency: 'USD', status: 'PENDING', total, issueDate: day('2026-09-01'), dueDate: day(iso) });
    const oct1 = await dueOn('2026-10-01', 100);
    const oct31 = await dueOn('2026-10-31', 200);
    const nov1 = await dueOn('2026-11-01', 400);
    const sep30 = await dueOn('2026-09-30', 800);
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);

    const found = data(await search.searchInvoicesForAssistant(actor, { dueDateFrom: '2026-10-01', dueDateTo: '2026-10-31' }));
    expect(found.rows.map((r) => r.invoiceId).sort()).toEqual([oct1.id, oct31.id].sort());
    expect(found.rows.map((r) => r.dueDate).sort()).toEqual(['2026-10-01', '2026-10-31']);
    expect(found.rows.some((r) => r.invoiceId === nov1.id || r.invoiceId === sep30.id)).toBe(false);

    const stats = data(await dash.getSummaryStats(actor, 'USD', { from: '2026-10-01', to: '2026-10-31' }));
    expect(stats.plannedCount).toBe(2);
    expect(stats.totalPlanned).toBe(300);
  });

  it('AC-14: paid invoices count by their issue day, not by a zone-local instant', async () => {
    clock('2026-10-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 10, issueDate: day('2026-10-01'), dueDate: day('2026-10-10') });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 20, issueDate: day('2026-11-01'), dueDate: day('2026-11-10') });
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);
    const stats = data(await dash.getSummaryStats(actor, 'USD', { from: '2026-10-01', to: '2026-10-31' }));
    expect(stats.receivedCount).toBe(1);
    expect(stats.totalReceived).toBe(10);

    // The chart puts each paid invoice on its own issue day, in every zone.
    const chart = data(await dash.getChartData(actor, 'USD', { from: '2026-10-01', to: '2026-10-03' }));
    expect(chart.map((p) => [p.date, p.paid])).toEqual([
      ['2026-10-01', 10],
      ['2026-10-02', 10],
      ['2026-10-03', 10],
    ]);
  });

  it('AC-14: the invoice list issue-date filter compares calendar days', async () => {
    clock('2026-10-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const a = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 1, issueDate: day('2026-10-01'), dueDate: day('2026-10-20') });
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 2, issueDate: day('2026-11-01'), dueDate: day('2026-11-20') });
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);
    const list = data(await svc.listInvoices(actor, { dateFrom: '2026-10-01', dateTo: '2026-10-31' }));
    expect(list.items.map((i) => i.id)).toEqual([a.id]);
  });
});
