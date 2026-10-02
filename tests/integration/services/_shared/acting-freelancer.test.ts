// T3 (spec.md §5 AC-21, AC-22; sad.md §4 time-zone resolution) — a zone is kept only if Intl AND
// PostgreSQL (pg_timezone_names, read once per process) know it, else UTC. Real throwaway Postgres.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type PrismaLike = { $queryRaw: (...args: unknown[]) => Promise<unknown> };

describe.runIf(containerRuntimeAvailable)('ActingFreelancer time-zone resolution — real DB (T3)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
  }, 60_000);

  afterAll(async () => {
    await db?.stop();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function load() {
    const { prisma } = (await import('@/prisma')) as unknown as { prisma: PrismaLike };
    const { actingFreelancerForTest } = await import('../../../support/acting-freelancer');
    return { prisma, actingFreelancerForTest };
  }

  it('AC-21: keeps Europe/Kyiv when Intl and PostgreSQL both know it', async () => {
    const { actingFreelancerForTest } = await load();
    const actor = await actingFreelancerForTest('user-1', 'Europe/Kyiv');
    expect(actor.userId).toBe('user-1');
    expect(actor.timeZone).toBe('Europe/Kyiv');
  });

  it('AC-22: a missing zone resolves to UTC', async () => {
    const { actingFreelancerForTest } = await load();
    expect((await actingFreelancerForTest('user-1')).timeZone).toBe('UTC');
  });

  it('AC-22: an unknown zone resolves to UTC', async () => {
    const { actingFreelancerForTest } = await load();
    expect((await actingFreelancerForTest('user-1', 'Mars/Olympus')).timeZone).toBe('UTC');
  });

  it('a zone Intl knows but pg_timezone_names lacks resolves to UTC', async () => {
    const { prisma, actingFreelancerForTest } = await load();
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ name: 'UTC' }, { name: 'Europe/London' }]);
    expect((await actingFreelancerForTest('user-1', 'Europe/Kyiv')).timeZone).toBe('UTC');
  });

  it('queries pg_timezone_names once per process', async () => {
    const { prisma, actingFreelancerForTest } = await load();
    const spy = vi.spyOn(prisma, '$queryRaw');
    await actingFreelancerForTest('user-1', 'Europe/Kyiv');
    await actingFreelancerForTest('user-2', 'America/New_York');
    await actingFreelancerForTest('user-3', 'Mars/Olympus');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
