// T04 (AC-22) — both ActingFreelancer factories read User.timeZone; the session factory seeds it
// from the `tz` cookie only while it is NULL; updateTimeZone saves a known zone and refuses others.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { seedInvoicesWithDates, storedDates } from '../../../support/factories/invoice-dates';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock = vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
let cookieValue: string | undefined;
let routeUserId = 'unset';
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/helpers/route-auth', () => ({ requireSession: async () => ({ ok: true, userId: routeUserId }) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tz' && cookieValue !== undefined ? { value: cookieValue } : undefined),
  }),
}));

describe.runIf(containerRuntimeAvailable)('Freelancer time zone on the account (T04, AC-22)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let session: typeof import('@/lib/helpers/session-actor');
  let factory: typeof import('@/lib/services/_shared/acting-freelancer');
  let actions: typeof import('@/lib/actions/profile-actions');
  let profileService: typeof import('@/lib/services/profile/profile');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    session = await import('@/lib/helpers/session-actor');
    factory = await import('@/lib/services/_shared/acting-freelancer');
    actions = await import('@/lib/actions/profile-actions');
    profileService = await import('@/lib/services/profile/profile');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    authMock.mockReset();
    cookieValue = undefined;
  });
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function signedIn(timeZone: string | null = null) {
    const f = await createFreelancer(prisma, { timeZone });
    authMock.mockResolvedValue({ user: { id: f.id, email: f.email } });
    return f;
  }
  const savedZone = async (id: string) => (await prisma.user.findUnique({ where: { id } }))?.timeZone;

  it('AC-22: no zone saved and a valid tz cookie -> saves it and uses it', async () => {
    const f = await signedIn();
    cookieValue = 'Europe/Kyiv';
    const r = await session.actingFreelancerFromSession();
    expect(r).toMatchObject({ success: true, data: { userId: f.id, timeZone: 'Europe/Kyiv' } });
    expect(await savedZone(f.id)).toBe('Europe/Kyiv');
  });

  it('T35: the first-visit seed with a Kyiv cookie normalises that Freelancer\'s legacy dates before returning', async () => {
    const f = await signedIn();
    const other = await createFreelancer(prisma);
    const ids = await seedInvoicesWithDates(prisma, f.id, [
      ['2026-09-30T21:00:00.000Z', '2026-10-14T21:00:00.000Z'],
      ['2026-10-14T22:30:00.000Z', '2026-10-14T22:30:00.000Z'],
    ]);
    const otherIds = await seedInvoicesWithDates(prisma, other.id, [['2026-09-30T21:00:00.000Z', '2026-10-14T21:00:00.000Z']]);
    cookieValue = 'Europe/Kyiv';
    await session.actingFreelancerFromSession();
    expect(await storedDates(prisma, ids)).toEqual([
      ['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z'],
      ['2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'],
    ]);
    expect(await storedDates(prisma, otherIds)).toEqual([['2026-09-30T21:00:00.000Z', '2026-10-14T21:00:00.000Z']]);
  });

  it('T35: the settings action from a NULL zone normalises, and a later change moves nothing', async () => {
    const f = await signedIn();
    const ids = await seedInvoicesWithDates(prisma, f.id, [['2026-09-30T21:00:00.000Z', '2026-10-14T21:00:00.000Z']]);
    expect((await actions.updateTimeZone('Europe/Kyiv')).success).toBe(true);
    const once = [['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z']];
    expect(await storedDates(prisma, ids)).toEqual(once);
    expect((await actions.updateTimeZone('America/New_York')).success).toBe(true);
    expect(await storedDates(prisma, ids)).toEqual(once);
  });

  it('AC-22: the seed is conditional - a second seed with another zone affects 0 rows', async () => {
    const f = await signedIn();
    cookieValue = 'Europe/Kyiv';
    await session.actingFreelancerFromSession();
    expect(await profileService.seedTimeZoneIfEmpty(f.id, 'Asia/Tokyo')).toBe(false);
    expect(await savedZone(f.id)).toBe('Europe/Kyiv');
  });

  it('AC-22: nothing saved and no cookie -> UTC, nothing saved', async () => {
    const f = await signedIn();
    const r = await session.actingFreelancerFromSession();
    expect(r).toMatchObject({ success: true, data: { timeZone: 'UTC' } });
    expect(await savedZone(f.id)).toBeNull();
  });

  it('AC-22: nothing saved and an invalid cookie -> UTC, nothing saved', async () => {
    const f = await signedIn();
    cookieValue = 'Mars/Olympus';
    const r = await session.actingFreelancerFromSession();
    expect(r).toMatchObject({ success: true, data: { timeZone: 'UTC' } });
    expect(await savedZone(f.id)).toBeNull();
  });

  it('AC-22: a saved zone wins over the cookie, which is ignored', async () => {
    const f = await signedIn('America/New_York');
    cookieValue = 'Europe/Kyiv';
    const r = await session.actingFreelancerFromSession();
    expect(r).toMatchObject({ success: true, data: { timeZone: 'America/New_York' } });
    expect(await savedZone(f.id)).toBe('America/New_York');
  });

  it('AC-22: the route factory reads the same column', async () => {
    const f = await createFreelancer(prisma, { timeZone: 'Asia/Tokyo' });
    routeUserId = f.id;
    cookieValue = 'Europe/Kyiv';
    const r = await session.actingFreelancerForRoute();
    expect(r.ok && r.actor.timeZone).toBe('Asia/Tokyo');
  });

  it('AC-22: actingFreelancerFromPersonalKey uses the given saved zone, NULL -> UTC', async () => {
    expect((await factory.actingFreelancerFromPersonalKey('u1', 'Europe/Kyiv')).timeZone).toBe('Europe/Kyiv');
    expect((await factory.actingFreelancerFromPersonalKey('u1', null)).timeZone).toBe('UTC');
  });

  it('AC-22: updateTimeZone saves a known zone and getProfile reports it', async () => {
    const f = await signedIn('Europe/Kyiv');
    const r = await actions.updateTimeZone('Asia/Tokyo');
    expect(r.success).toBe(true);
    expect(await savedZone(f.id)).toBe('Asia/Tokyo');
    const actor = await factory.actingFreelancerFromPersonalKey(f.id, 'Asia/Tokyo');
    expect(await profileService.getProfile(actor)).toMatchObject({ success: true, data: { timeZone: 'Asia/Tokyo' } });
  });

  it('AC-22: updateTimeZone refuses an unknown zone with TIME_ZONE_MESSAGE and leaves the column unchanged', async () => {
    const f = await signedIn('Europe/Kyiv');
    const r = await actions.updateTimeZone('Mars/Olympus');
    expect(r).toMatchObject({
      success: false,
      code: 'VALIDATION',
      error: 'Choose a time zone from the list.',
      fieldErrors: { timeZone: ['Choose a time zone from the list.'] },
    });
    expect(await savedZone(f.id)).toBe('Europe/Kyiv');
  });

  it('AC-22: updateTimeZone without a session is refused first', async () => {
    authMock.mockResolvedValue(null);
    const r = await actions.updateTimeZone('Asia/Tokyo');
    expect(r).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
  });
});

describe.runIf(!containerRuntimeAvailable)('Freelancer time zone on the account (T04)', () => {
  it.skip('skipped: no container runtime', () => {});
});
