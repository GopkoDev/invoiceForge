// T38 (spec.md §5 AC-25, AC-27; review-2026-09-27 F-31) — the dashboard chart's day boundaries
// and per-day grouping must use the Freelancer's browser time zone (ADR-0010), not the server's,
// and the DB query must use `[start, endExclusive)` from the already-tz-correct `appliedRange`
// (search-params.ts's `localDayRange`/`currentLocalMonth`) instead of re-deriving `startOfDay`/
// `endOfDay` in the server's own zone with an inclusive `lte`.
//
// docs/features/architecture-hardening/_review/review-2026-09-27.md F-31:
// lib/actions/dashboard-actions.ts:218-221,245-246,263-264,277-287.
//
// Scenario: a PAID invoice issued at 23:30 local time on the requested day in America/New_York
// (UTC-4 in September) is 2026-09-16T03:30:00Z — a DIFFERENT calendar day in UTC. Querying and
// grouping by the server's UTC day (the bug) puts this payment on the wrong chart day (Sep 16,
// outside the requested Sep-15-only range); grouping by the New York local day (the fix) puts it
// on Sep 15, the day it actually happened for the Freelancer.
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// get-paginated-invoices-page-clamp.test.ts: DATABASE_URL + vi.resetModules() + dynamic import,
// mock '@/auth', stub 'next/cache', mock '@sentry/nextjs'.
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

// T19: the zone now comes from the session actor (tz cookie), not from an argument.
const tzCookie = vi.hoisted(() => ({ value: 'UTC' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tz' ? { value: tzCookie.value } : undefined) }),
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  // T5: dashboard actions run inside a span; pass the callback straight through.
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
}));

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string };
type ChartDataPointLike = { date: string; paid: number; expected: number };
type GetDashboardChartData = (
  currency: string,
  period: { from: string; to: string } | undefined
) => Promise<ActionResult<ChartDataPointLike[]>>;

describe.runIf(containerRuntimeAvailable)(
  'getDashboardChartData local day bounds/grouping (T38, AC-25/AC-27, F-31)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let getDashboardChartData: GetDashboardChartData;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ getDashboardChartData } = (await import(
        '@/lib/actions/dashboard-actions'
      )) as unknown as { getDashboardChartData: GetDashboardChartData });
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      authMock.mockReset();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    it('queries [start, endExclusive) and groups by the New York local day, not the server UTC day', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'chart-tz@example.com' });
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id, { currency: 'USD' });
      const customer = await createCustomer(prisma, freelancer.id);

      // 23:30 America/New_York on Sep 15 == 2026-09-16T03:30:00Z: a different UTC calendar day.
      await seedInvoiceRow(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: {
          invoiceNumber: `${senderProfile.invoicePrefix}-0001`,
          status: 'PAID',
          issueDate: new Date('2026-09-16T03:30:00.000Z'),
        },
      });

      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      // appliedRange for the single local day 2026-09-15 in America/New_York (EDT, UTC-4):
      // [2026-09-15T04:00:00Z, 2026-09-16T04:00:00Z).
      tzCookie.value = 'America/New_York';
      const period = { from: '2026-09-15', to: '2026-09-15' };

      const result = await getDashboardChartData('USD', period);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Exactly one point for the requested local day, carrying the payment.
      expect(result.data).toHaveLength(1);
      expect(result.data[0].date).toBe('2026-09-15');
      expect(result.data[0].paid).toBe(100);
      expect(result.data[0].expected).toBe(100);
    });

    // N-11 (review-2026-09-28): a midnight spring-forward day east of UTC (Cairo 2026-04-24) made
    // the day-key loop list one day twice and skip the next.
    it('lists every local day exactly once across a midnight DST day (Africa/Cairo 2026-04-23..25)', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'chart-dst@example.com' });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      // Cairo: +02:00 until 2026-04-23T22:00Z, +03:00 after; 04-24 has 23h.
      tzCookie.value = 'Africa/Cairo';
      const period = { from: '2026-04-23', to: '2026-04-25' };

      const result = await getDashboardChartData('USD', period);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.map((p) => p.date)).toEqual(['2026-04-23', '2026-04-24', '2026-04-25']);
    });
  }
);

describe.runIf(!containerRuntimeAvailable)(
  'getDashboardChartData local day bounds/grouping (T38)',
  () => {
    it.skip('skipped: no container runtime', () => {});
  }
);
