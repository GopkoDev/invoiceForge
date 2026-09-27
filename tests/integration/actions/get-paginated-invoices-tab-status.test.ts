// T38 (spec.md §5 AC-26, review-2026-09-27 F-33) — off the "all" tab, the tab itself controls
// the status filter (drafts/final) and any `status` value is ignored by the query
// (invoice-actions.ts's `getTabStatusFilter`/`buildFilters`: `status` is only applied to `where`
// `if (status !== 'all' && tab === 'all')`). Before this fix, `applied.status` still echoed the
// raw requested status verbatim regardless of tab, so a link like `?tab=drafts&status=PAID`
// reported `applied.status: 'PAID'` even though the query never filtered by it — the toolbar's
// status pill and `hasActiveFilters` (hooks/use-invoice-filters.ts:166) then show a filter that
// isn't actually applied.
//
// docs/features/architecture-hardening/_review/review-2026-09-27.md F-33:
// invoice-actions.ts:884,956; hooks/use-invoice-filters.ts:166.
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// get-paginated-invoices-page-clamp.test.ts: DATABASE_URL + vi.resetModules() + dynamic import,
// mock '@/auth', stub 'next/cache', mock '@sentry/nextjs', mock 'next/headers' cookies().
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

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

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
type GetPaginatedInvoices = (params: {
  tab?: string;
  status?: string;
}) => Promise<ActionResult<{ applied: { status: string; tab: string } }>>;

describe.runIf(containerRuntimeAvailable)(
  'getPaginatedInvoices applied.status off the "all" tab (T38, AC-26, F-33)',
  () => {
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

    it('reports applied.status as "all" on the drafts tab, even when a status was requested', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'tab-status@example.com' });
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const customer = await createCustomer(prisma, freelancer.id);

      await seedInvoiceRow(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: { invoiceNumber: `${senderProfile.invoicePrefix}-0001` },
      });

      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      // The status filter is ignored by the query itself off the "all" tab (tab controls status
      // there), so the echoed `applied.status` must not claim it is still in effect.
      const result = await getPaginatedInvoices({ tab: 'drafts', status: 'PAID' });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.applied.status).toBe('all');
      expect(result.data.applied.tab).toBe('drafts');
    });

    it('keeps applied.status as requested on the "all" tab, where it does control the query', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'tab-status-all@example.com' });
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const customer = await createCustomer(prisma, freelancer.id);

      await seedInvoiceRow(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: { invoiceNumber: `${senderProfile.invoicePrefix}-0001` },
      });

      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await getPaginatedInvoices({ tab: 'all', status: 'PAID' });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.applied.status).toBe('PAID');
      expect(result.data.applied.tab).toBe('all');
    });
  }
);

describe.runIf(!containerRuntimeAvailable)(
  'getPaginatedInvoices applied.status off the "all" tab (T38)',
  () => {
    it.skip('skipped: no container runtime', () => {});
  }
);
