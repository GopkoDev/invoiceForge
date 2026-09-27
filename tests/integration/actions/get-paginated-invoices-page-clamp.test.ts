// T23 (spec.md §5 AC-26) — a page beyond the last page clamps to the last page, which is only
// known once the total is counted, per docs/features/architecture-hardening/tasks/
// t23-invoice-list-link-params.md (Inlined context — task file §Edge cases, "?page=999 beyond the
// last page: Page 1 and the pager shows 1"; §Checklist item 3, "clamp an out-of-range page to
// 1") and the test-plan.md row for AC-26 (below).
//
// test-plan.md row exercised here (§AC-26, integration):
//   - "a structurally valid but out-of-range page (?page=999) clamps to page 1, applied.page
//     reflects the clamp" — invoiceListParamsSchema alone can't know the total page count (it has
//     no database access), so this clamp is getPaginatedInvoices's job once `total` is known.
//
// Assumed API (task file §API contract, Checklist item 3, verbatim):
//   getPaginatedInvoices(params: InvoiceListParams): ActionResult<PaginatedInvoiceList &
//     { applied: InvoiceListParams }>
//   An out-of-range page (beyond totalPages) clamps `page` (and `applied.page`) to 1, per the
//   task file's edge-case wording ("Page 1 and the pager shows 1" — not the last page number).
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// get-paginated-invoices-local-day-range.test.ts: DATABASE_URL + vi.resetModules() + dynamic
// import, mock '@/auth', stub 'next/cache', mock '@sentry/nextjs', mock 'next/headers' cookies().
//
// RED (T23 not yet implemented): getPaginatedInvoices today uses `params.page` directly (no
// applied/clamp), so `page` in the response equals the requested out-of-range page (999), and
// there's no `applied` field to inspect at all — `result.data.page` is 999, not 1.
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
// get-paginated-invoices-local-day-range.test.ts). -------------------------------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// --- Sentry: invoice-actions.ts imports captureMessage at module load; stub so no real DSN/init
// is required. --------------------------------------------------------------------------------
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

// --- 'tz' cookie: same seam as get-paginated-invoices-local-day-range.test.ts — not exercised by
// this suite, but invoice-actions.ts reads it unconditionally, so it still needs a stub. --------
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
  page?: number;
  pageSize?: number;
}) => Promise<
  ActionResult<{
    invoices: InvoiceListItemLike[];
    page: number;
    totalPages: number;
    applied: { page: number };
  }>
>;

describe.runIf(containerRuntimeAvailable)('getPaginatedInvoices page clamp (T23, AC-26)', () => {
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
    setTzCookie('UTC');
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('AC-26: a page beyond the last page clamps to page 1, and applied.page reflects the clamp', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'page-clamp@example.com' });
    const senderProfile = await createSenderProfile(prisma, freelancer.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, freelancer.id);

    const invoice = await seedInvoiceRow(prisma, {
      senderProfile,
      customer,
      bankAccount,
      overrides: { invoiceNumber: `${senderProfile.invoicePrefix}-0001` },
    });

    authMock.mockResolvedValue({ user: { id: freelancer.id } });

    // Only 1 invoice exists, so with pageSize 10 there's exactly 1 total page; page 999 is
    // beyond it.
    const result = await getPaginatedInvoices({ page: 999, pageSize: 10 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.applied.page).toBe(1);
    expect(result.data.invoices.map((inv) => inv.id)).toContain(invoice.id);
  });
});

describe.runIf(!containerRuntimeAvailable)('getPaginatedInvoices page clamp (T23)', () => {
  it.skip('skipped: no container runtime', () => {});
});
