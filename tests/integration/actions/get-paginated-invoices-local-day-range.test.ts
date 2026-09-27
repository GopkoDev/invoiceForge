// T23 (spec.md §5 AC-27) — getPaginatedInvoices filters a date range by local day bounds in the
// Freelancer's browser time zone (the `tz` cookie, ADR-0010), with an inclusive last day, per
// docs/features/architecture-hardening/tasks/t23-invoice-list-link-params.md (Inlined context —
// contracts/server-actions.md §Link parameters table: "Date bounds:
// [startOfDay(dateFrom, tz), startOfDay(dateTo + 1 day, tz))"; sad.md §8 Hard rule "Time and time
// zones") and the test-plan.md row for AC-27 (below).
//
// test-plan.md row exercised here (§AC-27, integration):
//   - "invoice issued late on the last day is included": invoices at local 23:59:59.999 and
//     00:00 on the last day are returned, and one at 00:00 the next day is not. This suite uses
//     the task file's own edge-case wording (23:30 included / 00:30 next day excluded) against an
//     explicit non-UTC zone (Europe/Kyiv, winter/EET so the offset is unambiguous), per
//     test-plan.md §Test data — Time ("zones are passed explicitly, never the machine's TZ").
//
// Assumed API (task file §API contract, Checklist item 3, verbatim):
//   getPaginatedInvoices(params: InvoiceListParams): ActionResult<PaginatedInvoiceList &
//     { applied: InvoiceListParams }>
//   tz comes from the `tz` cookie via lib/helpers/time-zone.ts's getRequestTimeZone() (same seam
//   as tests/unit/lib/helpers/time-zone.test.ts), not a parameter on getPaginatedInvoices itself.
//   Date filter: gte startOfLocalDay(dateFrom, tz), lt startOfLocalDay(dateTo + 1 day, tz).
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// delete-blocked-by-invoices.test.ts: DATABASE_URL + vi.resetModules() + dynamic import, mock
// '@/auth', stub 'next/cache', mock '@sentry/nextjs' (module-load import in invoice-actions.ts),
// and mock 'next/headers' cookies() the same way tests/unit/lib/helpers/time-zone.test.ts drives
// getRequestTimeZone() — this lets the test set the `tz` cookie without a real request.
//
// RED (T23 not yet implemented): getPaginatedInvoices today builds `issueDate: { gte: new
// Date(dateFrom), lte: new Date(dateTo) }` directly off the raw ISO date strings — parsed as UTC
// midnight, with an *inclusive* `lte` UTC end, never the caller's local day bounds — so it
// currently returns the wrong pair for a non-UTC zone: this test expects the 23:30-local invoice
// in and the 00:30-local (next day) invoice out; today's UTC-lte reading of the same instants
// gets both filters wrong for Europe/Kyiv (UTC+2 in this window).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createCustomer } from '../../support/factories/customer';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice as seedInvoiceRow } from '../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// delete-blocked-by-invoices.test.ts). -----------------------------------------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// --- Sentry: invoice-actions.ts imports captureMessage at module load; stub so no real DSN/init
// is required. --------------------------------------------------------------------------------
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

// --- 'tz' cookie: same seam as tests/unit/lib/helpers/time-zone.test.ts's getRequestTimeZone
// coverage — this lets the test drive the browser-reported zone without a real request. --------
const cookiesMock = vi.fn();
vi.mock('next/headers', () => ({ cookies: () => cookiesMock() }));

function setTzCookie(value: string | undefined) {
  cookiesMock.mockReturnValue({
    get: (name: string) => (name === 'tz' && value !== undefined ? { value } : undefined),
  });
}

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string };
type InvoiceListItemLike = { id: string; invoiceNumber: string };
type GetPaginatedInvoices = (params: {
  dateFrom?: string;
  dateTo?: string;
}) => Promise<ActionResult<{ invoices: InvoiceListItemLike[] }>>;

describe.runIf(containerRuntimeAvailable)('getPaginatedInvoices local day range (T23, AC-27)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let getPaginatedInvoices: GetPaginatedInvoices;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    ({ getPaginatedInvoices } = (await import(
      '@/lib/actions/invoice-actions/invoice-actions'
    )) as unknown as { getPaginatedInvoices: GetPaginatedInvoices });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    authMock.mockReset();
    cookiesMock.mockReset();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('AC-27: an invoice issued at 23:30 local on the range\'s last day is included, one at 00:30 the next local day is not (Europe/Kyiv, UTC+2)', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'kyiv-range@example.com' });
    const senderProfile = await createSenderProfile(prisma, freelancer.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, freelancer.id);

    // Europe/Kyiv is UTC+2 (EET) in mid-January — no DST ambiguity.
    // Local 2026-01-15T23:30:00+02:00 == UTC 2026-01-15T21:30:00Z (inside the range).
    const lateOnLastDay = await seedInvoiceRow(prisma, {
      senderProfile,
      customer,
      bankAccount,
      overrides: {
        invoiceNumber: `${senderProfile.invoicePrefix}-0001`,
        issueDate: new Date('2026-01-15T21:30:00.000Z'),
      },
    });
    // Local 2026-01-16T00:30:00+02:00 == UTC 2026-01-15T22:30:00Z (just past local midnight,
    // outside the range).
    const justAfterMidnightNextDay = await seedInvoiceRow(prisma, {
      senderProfile,
      customer,
      bankAccount,
      overrides: {
        invoiceNumber: `${senderProfile.invoicePrefix}-0002`,
        issueDate: new Date('2026-01-15T22:30:00.000Z'),
      },
    });

    authMock.mockResolvedValue({ user: { id: freelancer.id } });
    setTzCookie('Europe/Kyiv');

    const result = await getPaginatedInvoices({ dateFrom: '2026-01-15', dateTo: '2026-01-15' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const ids = result.data.invoices.map((inv) => inv.id);
    expect(ids).toContain(lateOnLastDay.id);
    expect(ids).not.toContain(justAfterMidnightNextDay.id);
  });
});

describe.runIf(!containerRuntimeAvailable)('getPaginatedInvoices local day range (T23)', () => {
  it.skip('skipped: no container runtime', () => {});
});
