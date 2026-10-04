// T04 (AC-22) — request-free integration tests for the profile service's time-zone functions:
// getProfile, getSavedTimeZone, seedTimeZoneIfEmpty, updateTimeZone. No session, no cookies.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@sentry/nextjs', () => ({ captureException: () => {}, captureMessage: () => {} }));

describe.runIf(containerRuntimeAvailable)('profile service time zone — request-free (T04, AC-22)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let profile: typeof import('@/lib/services/profile/profile');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    profile = await import('@/lib/services/profile/profile');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('getSavedTimeZone is null until a zone is saved, then the saved zone', async () => {
    const f = await createFreelancer(prisma);
    expect(await profile.getSavedTimeZone(f.id)).toBeNull();
    await prisma.user.update({ where: { id: f.id }, data: { timeZone: 'Europe/Kyiv' } });
    expect(await profile.getSavedTimeZone(f.id)).toBe('Europe/Kyiv');
  });

  it('seedTimeZoneIfEmpty writes once and never overwrites', async () => {
    const f = await createFreelancer(prisma);
    expect(await profile.seedTimeZoneIfEmpty(f.id, 'Europe/Kyiv')).toBe(true);
    expect(await profile.seedTimeZoneIfEmpty(f.id, 'Asia/Tokyo')).toBe(false);
    expect(await profile.getSavedTimeZone(f.id)).toBe('Europe/Kyiv');
  });

  it('getProfile returns timeZone null when none is saved', async () => {
    const f = await createFreelancer(prisma);
    const r = await profile.getProfile(await actingFreelancerForTest(f.id));
    expect(r).toMatchObject({ success: true, data: { timeZone: null, email: f.email } });
  });

  it('updateTimeZone saves a known zone', async () => {
    const f = await createFreelancer(prisma);
    const r = await profile.updateTimeZone(await actingFreelancerForTest(f.id), 'Europe/Kyiv');
    expect(r.success).toBe(true);
    expect(await profile.getSavedTimeZone(f.id)).toBe('Europe/Kyiv');
  });

  it('updateTimeZone refuses a zone Intl knows but pg_timezone_names does not, and an unknown one', async () => {
    const f = await createFreelancer(prisma, { timeZone: 'Europe/Kyiv' });
    const actor = await actingFreelancerForTest(f.id);
    for (const bad of ['Mars/Olympus', 'europe/kyiv', '']) {
      const r = await profile.updateTimeZone(actor, bad);
      expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
    }
    expect(await profile.getSavedTimeZone(f.id)).toBe('Europe/Kyiv');
  });

  it('updateTimeZone on a foreign Freelancer B record changes only the acting Freelancer', async () => {
    const a = await createFreelancer(prisma);
    const b = await createFreelancer(prisma, { timeZone: 'Asia/Tokyo' });
    await profile.updateTimeZone(await actingFreelancerForTest(a.id), 'Europe/Kyiv');
    expect(await profile.getSavedTimeZone(b.id)).toBe('Asia/Tokyo');
  });
});

describe.runIf(!containerRuntimeAvailable)('profile service time zone (T04)', () => {
  it.skip('skipped: no container runtime', () => {});
});
