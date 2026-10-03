// T6 (spec.md §5 AC-09, AC-10): the business layer refuses a custom period longer than 5 years
// before any query, accepts exactly 5 years, and an omitted period (all time) is never capped.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { addInvoice, createQueryRecorder, seedFreelancer } from './harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
const recorder = createQueryRecorder(() => testClient);
vi.mock('@/prisma', () => ({ prisma: recorder.proxy }));

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Period = { from: string; to: string };
type Res =
  | { success: true; data: unknown }
  | {
      success: false;
      code: string;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };
type Service = {
  getSummaryStats: (a: Actor, c: string, p?: Period) => Promise<Res>;
  getChartData: (a: Actor, c: string, p?: Period) => Promise<Res>;
  getSenderAccounts: (a: Actor, c: string, p?: Period) => Promise<Res>;
};

const PERIOD_TOO_LONG =
  'A custom period can be at most 5 years. Choose "All time" to see your full history.';

describe.runIf(containerRuntimeAvailable)(
  'dashboard five-year period cap (T6)',
  () => {
    let db: TestDatabase;
    let svc: Service;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      testClient = createTestPrismaClient(db.connectionString);
      svc =
        (await import('@/lib/services/dashboard/dashboard')) as unknown as Service;
    }, 60_000);

    afterAll(async () => {
      await testClient?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => recorder.reset());
    afterEach(async () => {
      await truncateAllTables(testClient);
    });

    it.each([
      ['five years and one day', { from: '2021-01-01', to: '2026-01-02' }],
      ['0100 to 9999', { from: '0100-01-01', to: '9999-12-31' }],
    ])(
      'refuses %s with PERIOD_TOO_LONG before any query (AC-10)',
      async (_n, period) => {
        const a = await seedFreelancer(testClient, ['USD']);
        const actor = await actingFreelancerForTest(a.userId, 'UTC');
        recorder.reset();
        for (const r of [
          await svc.getSummaryStats(actor, 'USD', period),
          await svc.getChartData(actor, 'USD', period),
          await svc.getSenderAccounts(actor, 'USD', period),
        ]) {
          expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
          expect(
            (r as { fieldErrors?: Record<string, string[]> }).fieldErrors
              ?.period
          ).toEqual([PERIOD_TOO_LONG]);
        }
        expect(recorder.rowCounts).toEqual([]);
      }
    );

    it('accepts exactly five years', async () => {
      const a = await seedFreelancer(testClient, ['USD']);
      const actor = await actingFreelancerForTest(a.userId, 'UTC');
      const period = { from: '2021-01-01', to: '2026-01-01' };
      expect(await svc.getSummaryStats(actor, 'USD', period)).toMatchObject({
        success: true,
      });
      expect(await svc.getSenderAccounts(actor, 'USD', period)).toMatchObject({
        success: true,
      });
    });

    it('an omitted period spans more than five years of invoices (AC-09)', async () => {
      const a = await seedFreelancer(testClient, ['USD']);
      await addInvoice(a, {
        currency: 'USD',
        status: 'PAID',
        total: 100,
        issueDate: new Date('2015-03-01T12:00:00Z'),
        dueDate: new Date('2015-03-15T12:00:00Z'),
      });
      await addInvoice(a, {
        currency: 'USD',
        status: 'PAID',
        total: 200,
        issueDate: new Date('2026-03-01T12:00:00Z'),
        dueDate: new Date('2026-03-15T12:00:00Z'),
      });
      const actor = await actingFreelancerForTest(a.userId, 'UTC');
      const r = await svc.getSummaryStats(actor, 'USD');
      expect(r.success).toBe(true);
      expect(
        (r as { data: { receivedCount: number } }).data.receivedCount
      ).toBe(2);
    });
  }
);
