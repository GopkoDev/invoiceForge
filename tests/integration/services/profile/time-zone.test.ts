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
import { seedInvoicesWithDates, storedDates } from '../../../support/factories/invoice-dates';

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

  // T35 (G-01): the zone going NULL -> value normalises that Freelancer's legacy invoice dates in the
  // same transaction; the saved zone is the "already done" marker.
  describe('lazy normalisation of legacy invoice dates (T35, AC-12, AC-23b, AC-24)', () => {
    // Kyiv local midnight 15 Oct (EEST), a Kyiv time of day, and an already-stored UTC-midnight day.
    const legacy: Array<[string, string]> = [
      ['2026-09-30T21:00:00.000Z', '2026-10-14T21:00:00.000Z'],
      ['2026-10-14T22:30:00.000Z', '2026-11-14T22:30:00.000Z'],
      ['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z'],
    ];
    const normalised: Array<[string, string]> = [
      ['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z'],
      ['2026-10-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'],
      ['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z'],
    ];

    it('the first-visit seed turns Kyiv local-midnight and time-of-day values into the Kyiv day', async () => {
      const f = await createFreelancer(prisma);
      const ids = await seedInvoicesWithDates(prisma, f.id, legacy);
      expect(await profile.seedTimeZoneIfEmpty(f.id, 'Europe/Kyiv')).toBe(true);
      expect(await storedDates(prisma, ids)).toEqual(normalised);
    });

    it('a seed that loses the race (zone already saved) moves nothing', async () => {
      const f = await createFreelancer(prisma, { timeZone: 'Europe/Kyiv' });
      const ids = await seedInvoicesWithDates(prisma, f.id, legacy);
      expect(await profile.seedTimeZoneIfEmpty(f.id, 'Asia/Tokyo')).toBe(false);
      expect(await storedDates(prisma, ids)).toEqual(legacy);
    });

    it('two concurrent first seeds normalise once', async () => {
      const f = await createFreelancer(prisma);
      const ids = await seedInvoicesWithDates(prisma, f.id, legacy);
      const wrote = await Promise.all([
        profile.seedTimeZoneIfEmpty(f.id, 'Europe/Kyiv'),
        profile.seedTimeZoneIfEmpty(f.id, 'Europe/Kyiv'),
      ]);
      expect(wrote.filter(Boolean)).toHaveLength(1);
      expect(await storedDates(prisma, ids)).toEqual(normalised);
    });

    it('a settings save from NULL does the same', async () => {
      const f = await createFreelancer(prisma);
      const ids = await seedInvoicesWithDates(prisma, f.id, legacy);
      const r = await profile.updateTimeZone(await actingFreelancerForTest(f.id), 'Europe/Kyiv');
      expect(r.success).toBe(true);
      expect(await storedDates(prisma, ids)).toEqual(normalised);
    });

    it('a later zone change (saved -> other) moves no date', async () => {
      const f = await createFreelancer(prisma);
      const ids = await seedInvoicesWithDates(prisma, f.id, legacy);
      const actor = await actingFreelancerForTest(f.id);
      await profile.updateTimeZone(actor, 'Europe/Kyiv');
      await profile.updateTimeZone(actor, 'America/New_York');
      expect(await profile.getSavedTimeZone(f.id)).toBe('America/New_York');
      expect(await storedDates(prisma, ids)).toEqual(normalised);
    });

    it('a zone change on an account that already had a saved zone leaves legacy values as they are', async () => {
      const f = await createFreelancer(prisma, { timeZone: 'Asia/Tokyo' });
      const ids = await seedInvoicesWithDates(prisma, f.id, legacy);
      await profile.updateTimeZone(await actingFreelancerForTest(f.id), 'Europe/Kyiv');
      expect(await storedDates(prisma, ids)).toEqual(legacy);
    });

    it('UTC-midnight rows never move, even for a zone west of UTC', async () => {
      const f = await createFreelancer(prisma);
      const day: Array<[string, string]> = [['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z']];
      const ids = await seedInvoicesWithDates(prisma, f.id, day);
      await profile.updateTimeZone(await actingFreelancerForTest(f.id), 'America/New_York');
      expect(await storedDates(prisma, ids)).toEqual(day);
    });

    it('T40 (H-10): from NULL to America/New_York, a value past UTC midnight becomes the previous New York day', async () => {
      const f = await createFreelancer(prisma);
      const rows: Array<[string, string]> = [['2026-10-16T02:00:00.000Z', '2026-10-16T02:00:00.000Z']];
      const ids = await seedInvoicesWithDates(prisma, f.id, rows);
      await profile.updateTimeZone(await actingFreelancerForTest(f.id), 'America/New_York');
      expect(await storedDates(prisma, ids)).toEqual([['2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z']]);
    });

    it("another Freelancer's invoices are untouched", async () => {
      const a = await createFreelancer(prisma);
      const b = await createFreelancer(prisma);
      const aIds = await seedInvoicesWithDates(prisma, a.id, legacy);
      const bIds = await seedInvoicesWithDates(prisma, b.id, legacy);
      await profile.seedTimeZoneIfEmpty(a.id, 'Europe/Kyiv');
      expect(await storedDates(prisma, aIds)).toEqual(normalised);
      expect(await storedDates(prisma, bIds)).toEqual(legacy);
    });

    it('a failed normalisation rolls the zone back with it', async () => {
      const f = await createFreelancer(prisma);
      const ids = await seedInvoicesWithDates(prisma, f.id, legacy);
      await prisma.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION t35_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 't35'; END; $$ LANGUAGE plpgsql`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER t35_fail BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION t35_fail()`,
      );
      try {
        await expect(profile.seedTimeZoneIfEmpty(f.id, 'Europe/Kyiv')).rejects.toThrow();
        expect(await profile.getSavedTimeZone(f.id)).toBeNull();
        expect(await storedDates(prisma, ids)).toEqual(legacy);
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER t35_fail ON "Invoice"`);
      }
    });
  });
});

describe.runIf(!containerRuntimeAvailable)('profile service time zone (T04)', () => {
  it.skip('skipped: no container runtime', () => {});
});
