// T15 (spec.md §6 NFR "Limit-record retention"; ADR-0007; sad.md §6 flow 10) - the daily
// limit-record purge, GET /api/cron/purge-limits, behind the Vercel Cron bearer secret.
//
// Seams assumed (RED - app/api/cron/purge-limits/route.ts does not exist yet):
//   - `export async function GET(request: Request): Promise<Response>`
//   - same-process app code (tests/README.md option 1): DATABASE_URL is set to the throwaway
//     container before '@/prisma' is imported; the same singleton is spied on for the 500 path.
//   - the cutoff comes from the app clock (`new Date()`), so a faked system time drives it.
//   - Sentry Crons check-ins go through `captureCheckIn` from '@sentry/nextjs'
//     (status in_progress first, then ok / error).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createLimitEvent, limitKeyDigest } from '../../support/factories/limit-event';
import { assertMatchesContract } from '../../support/contract/validate';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const captureCheckIn = vi.fn((_checkIn: { status: string }) => 'check-in-id');
vi.mock('@sentry/nextjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/nextjs')>();
  return { ...actual, captureCheckIn: (c: { status: string }) => captureCheckIn(c) };
});

const SECRET = 'test-only-cron-secret-0123456789abcdef';
const T0 = new Date('2026-10-02T12:00:00.000Z');
const HOUR = 60 * 60_000;

type GetHandler = (request: Request) => Promise<Response>;

describe.runIf(containerRuntimeAvailable)('GET /api/cron/purge-limits (T15)', () => {
  let db: TestDatabase;
  let factoryPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let GET: GetHandler;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    process.env.CRON_SECRET = SECRET;
    vi.resetModules();
    factoryPrisma = createTestPrismaClient(db.connectionString);
    ({ prisma: appPrisma } = (await import('@/prisma')) as { prisma: PrismaClient });
    ({ GET } = (await import('@/app/api/cron/purge-limits/route')) as { GET: GetHandler });
  }, 60_000);

  afterAll(async () => {
    await factoryPrisma?.$disconnect();
    await appPrisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    captureCheckIn.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await truncateAllTables(factoryPrisma);
  });

  const call = (headers?: Record<string, string>) =>
    GET(new Request('http://localhost/api/cron/purge-limits', { headers }));
  const authed = () => call({ authorization: `Bearer ${SECRET}` });

  async function seedMixed() {
    const user = await createFreelancer(factoryPrisma);
    const old = new Date(T0.getTime() - 25 * HOUR);
    const young = new Date(T0.getTime() - 23 * HOUR);
    await createLimitEvent(factoryPrisma, { scope: 'SIGNIN_SOURCE', key: limitKeyDigest('a'), at: old });
    await createLimitEvent(factoryPrisma, {
      scope: 'SIGNIN_ADDRESS',
      key: limitKeyDigest('b'),
      outcome: 'SENT',
      at: old,
    });
    await createLimitEvent(factoryPrisma, {
      scope: 'EXPORT',
      userId: user.id,
      outcome: 'STARTED',
      at: old,
    });
    await createLimitEvent(factoryPrisma, { scope: 'SIGNIN_SOURCE', key: limitKeyDigest('a'), at: young });
    await createLimitEvent(factoryPrisma, {
      scope: 'SIGNIN_ADDRESS',
      key: limitKeyDigest('c'),
      outcome: 'SENT',
      at: young,
    });
  }

  it('deletes rows older than 24 h of every scope and key, keeps younger ones, counts exactly', async () => {
    await seedMixed();

    const res = await authed();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: { deleted: 3 } });
    await assertMatchesContract({ operationId: 'purgeLimitRecords', status: 200, body });
    expect(await factoryPrisma.limitEvent.count()).toBe(2);
    expect(
      await factoryPrisma.limitEvent.count({ where: { at: { lt: new Date(T0.getTime() - 24 * HOUR) } } })
    ).toBe(0);
  });

  it('is idempotent: a second run the same day deletes nothing', async () => {
    await seedMixed();
    await authed();

    const second = await (await authed()).json();

    expect(second).toEqual({ success: true, data: { deleted: 0 } });
    expect(await factoryPrisma.limitEvent.count()).toBe(2);
  });

  it('sends Sentry Crons check-ins in_progress then ok', async () => {
    await authed();

    expect(captureCheckIn.mock.calls.map(([c]) => c.status)).toEqual(['in_progress', 'ok']);
  });

  it.each([
    ['no Authorization header', undefined],
    ['a wrong secret', { authorization: 'Bearer wrong-secret' }],
    ['a secret of a different length', { authorization: 'Bearer x' }],
    ['the secret without the Bearer scheme', { authorization: SECRET }],
  ])('refuses %s with 401 UNAUTHORIZED and deletes nothing', async (_name, headers) => {
    await seedMixed();

    const res = await call(headers);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not authorized.' });
    await assertMatchesContract({ operationId: 'purgeLimitRecords', status: 401, body });
    expect(await factoryPrisma.limitEvent.count()).toBe(5);
  });

  it('answers 500 FAILED and sends an error check-in when the delete fails', async () => {
    await seedMixed();
    vi.spyOn(appPrisma, '$executeRaw').mockRejectedValue(new Error('connection lost'));

    const res = await authed();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, code: 'FAILED', error: 'Purge failed.' });
    await assertMatchesContract({ operationId: 'purgeLimitRecords', status: 500, body });
    expect(JSON.stringify(body)).not.toContain('connection lost');
    expect(captureCheckIn.mock.calls.map(([c]) => c.status)).toEqual(['in_progress', 'error']);
  });
});
