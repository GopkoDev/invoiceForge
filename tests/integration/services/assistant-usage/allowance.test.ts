// T08 (ai-assistant; spec.md §5 AC-09, AC-10, AC-10b, AC-11; ADR-0009) - the Daily message allowance
// counted in per-local-day rows: read, reserve with a conditional increment, release on failure.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const KYIV = 'Europe/Kyiv'; // UTC+3 in June 2026
const AUCKLAND = 'Pacific/Auckland'; // UTC+12 in June 2026
const NOW = new Date('2026-06-15T10:00:00Z'); // 13:00 in Kyiv, 15 June
const DAY = new Date('2026-06-15T00:00:00.000Z');

type State = { limit: 30; used: number; left: number; renewsAt: string; timeZone: string };
type Reserved =
  | { ok: true; state: State; release: () => Promise<State> }
  | { ok: false; usedUp: { kind: string; limit: 30; renewsAt: string; timeZone: string } }
  | { ok: false; unavailable: true };
type Svc = {
  getAllowanceState: (
    actor: unknown
  ) => Promise<{ success: true; data: State } | { success: false; error: string }>;
  reserveMessageSlot: (actor: unknown, now: Date) => Promise<Reserved>;
};

describe.runIf(containerRuntimeAvailable)('Daily message allowance (T08)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-usage')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function freelancer(zone = KYIV, email = 't08@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: zone });
    return { user, actor: await actingFreelancerForTest(user.id, zone) };
  }

  async function seedDay(
    userId: string,
    used: number,
    opts: { day?: Date; timeZone?: string; firstMessageAt?: Date } = {}
  ) {
    await prisma.messageAllowanceDay.create({
      data: {
        userId,
        day: opts.day ?? DAY,
        used,
        timeZone: opts.timeZone ?? KYIV,
        firstMessageAt: opts.firstMessageAt ?? new Date('2026-06-15T06:00:00Z'),
      },
    });
  }

  const usedOf = async (userId: string, day = DAY) =>
    (await prisma.messageAllowanceDay.findUniqueOrThrow({ where: { userId_day: { userId, day } } })).used;

  describe('getAllowanceState', () => {
    it('with no row today: used 0, left 30, renews at the next local midnight, and writes nothing', async () => {
      const { user, actor } = await freelancer();
      const res = await svc.getAllowanceState(actor);
      expect(res).toEqual({
        success: true,
        data: { limit: 30, used: 0, left: 30, renewsAt: expect.any(String), timeZone: KYIV },
      });
      expect(await prisma.messageAllowanceDay.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  describe('AC-09: 18 used, one more message leaves 11', () => {
    it('reserve returns used 19 and left 11, and the row says 19', async () => {
      const { user, actor } = await freelancer();
      await seedDay(user.id, 18);
      const r = await svc.reserveMessageSlot(actor, NOW);
      expect(r.ok).toBe(true);
      if (!r.ok || !('state' in r)) return;
      expect(r.state).toMatchObject({ limit: 30, used: 19, left: 11, timeZone: KYIV });
      expect(r.state.renewsAt).toBe('2026-06-15T21:00:00.000Z');
      expect(await usedOf(user.id)).toBe(19);
    });

    it('the first reservation of the day opens the row with the zone and the first-message time', async () => {
      const { user, actor } = await freelancer();
      const r = await svc.reserveMessageSlot(actor, NOW);
      expect(r.ok).toBe(true);
      const row = await prisma.messageAllowanceDay.findUniqueOrThrow({
        where: { userId_day: { userId: user.id, day: DAY } },
      });
      expect(row).toMatchObject({ used: 1, timeZone: KYIV });
      expect(row.firstMessageAt.toISOString()).toBe(NOW.toISOString());
    });
  });

  describe('AC-10: used up', () => {
    it('30 reservations succeed and the 31st is ALLOWANCE_USED_UP with renewsAt', async () => {
      const { user, actor } = await freelancer();
      for (let i = 1; i <= 30; i++) {
        const r = await svc.reserveMessageSlot(actor, NOW);
        expect(r.ok, `reservation ${i}`).toBe(true);
      }
      const r31 = await svc.reserveMessageSlot(actor, NOW);
      expect(r31).toEqual({
        ok: false,
        usedUp: {
          kind: 'ALLOWANCE_USED_UP',
          limit: 30,
          renewsAt: '2026-06-15T21:00:00.000Z',
          timeZone: KYIV,
        },
      });
      expect(await usedOf(user.id)).toBe(30);
    });

    it('the read after the 30th shows left 0', async () => {
      // getAllowanceState reads the real clock, so the 30 messages are reserved on the real today.
      const { actor } = await freelancer();
      for (let i = 0; i < 30; i++) expect((await svc.reserveMessageSlot(actor, new Date())).ok).toBe(true);
      const res = await svc.getAllowanceState(actor);
      expect(res.success && res.data).toMatchObject({ used: 30, left: 0 });
    });

    it('another Freelancer is unaffected by a used-up allowance', async () => {
      const a = await freelancer(KYIV, 't08-a@example.com');
      const b = await freelancer(KYIV, 't08-b@example.com');
      await seedDay(a.user.id, 30);
      expect((await svc.reserveMessageSlot(b.actor, NOW)).ok).toBe(true);
    });

    it('after local midnight the allowance has renewed', async () => {
      const { user, actor } = await freelancer();
      await seedDay(user.id, 30);
      const r = await svc.reserveMessageSlot(actor, new Date('2026-06-15T21:00:00Z'));
      expect(r.ok).toBe(true);
      expect(await usedOf(user.id, new Date('2026-06-16T00:00:00.000Z'))).toBe(1);
      expect(await usedOf(user.id)).toBe(30);
    });
  });

  describe('AC-10b: simultaneous sends', () => {
    it('two parallel reserves for the last slot give exactly one success', async () => {
      const { user, actor } = await freelancer();
      await seedDay(user.id, 29);
      const results = await Promise.all([
        svc.reserveMessageSlot(actor, NOW),
        svc.reserveMessageSlot(actor, NOW),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const lost = results.find((r) => !r.ok);
      expect(lost).toMatchObject({ ok: false, usedUp: { kind: 'ALLOWANCE_USED_UP' } });
      expect(await usedOf(user.id)).toBe(30);
    });

    it('many parallel reserves never exceed the limit, from an empty day', async () => {
      const { user, actor } = await freelancer();
      const results = await Promise.all(
        Array.from({ length: 40 }, () => svc.reserveMessageSlot(actor, NOW))
      );
      expect(results.filter((r) => r.ok)).toHaveLength(30);
      expect(results.filter((r) => !r.ok && 'usedUp' in r)).toHaveLength(10);
      expect(await usedOf(user.id)).toBe(30);
    });
  });

  describe('AC-11: a system-side failure gives the slot back', () => {
    it('release restores the slot and returns the new state', async () => {
      const { user, actor } = await freelancer();
      await seedDay(user.id, 18);
      const r = await svc.reserveMessageSlot(actor, NOW);
      if (!r.ok || !('release' in r)) throw new Error('expected a reservation');
      const after = await r.release();
      expect(after).toMatchObject({ used: 18, left: 12 });
      expect(await usedOf(user.id)).toBe(18);
    });

    it('releasing twice gives back only one slot', async () => {
      const { user, actor } = await freelancer();
      await seedDay(user.id, 18);
      const r = await svc.reserveMessageSlot(actor, NOW);
      if (!r.ok || !('release' in r)) throw new Error('expected a reservation');
      await r.release();
      await r.release();
      expect(await usedOf(user.id)).toBe(18);
    });

    it('a released slot can be reserved again at the limit', async () => {
      const { user, actor } = await freelancer();
      await seedDay(user.id, 29);
      const r = await svc.reserveMessageSlot(actor, NOW);
      if (!r.ok || !('release' in r)) throw new Error('expected a reservation');
      expect(await svc.reserveMessageSlot(actor, NOW)).toMatchObject({ ok: false });
      await r.release();
      expect((await svc.reserveMessageSlot(actor, NOW)).ok).toBe(true);
    });

    it('release never takes the count below zero', async () => {
      const { user, actor } = await freelancer();
      const r = await svc.reserveMessageSlot(actor, NOW);
      if (!r.ok || !('release' in r)) throw new Error('expected a reservation');
      await prisma.messageAllowanceDay.update({
        where: { userId_day: { userId: user.id, day: DAY } },
        data: { used: 0 },
      });
      await r.release();
      expect(await usedOf(user.id)).toBe(0);
    });
  });

  describe('fails closed', () => {
    it('when the reservation cannot be written, nothing is reserved: unavailable', async () => {
      // No such user: the day row cannot be written (foreign key), so nothing may be processed.
      const ghost = await actingFreelancerForTest('no-such-user', KYIV);
      expect(await svc.reserveMessageSlot(ghost, NOW)).toEqual({ ok: false, unavailable: true });
    });
  });

  describe('time-zone change (spec §8, ADR-0009)', () => {
    it('less than 24 h after the first message the same row keeps counting, renewing at the 24 h mark', async () => {
      const { user } = await freelancer(AUCKLAND);
      const auckland = await actingFreelancerForTest(user.id, AUCKLAND);
      await seedDay(user.id, 30, {
        timeZone: KYIV,
        firstMessageAt: new Date('2026-06-15T20:00:00Z'),
      });
      // 22:00Z is already 16 June in Auckland, but only 2 h after the first message.
      const r = await svc.reserveMessageSlot(auckland, new Date('2026-06-15T22:00:00Z'));
      expect(r).toMatchObject({
        ok: false,
        usedUp: { kind: 'ALLOWANCE_USED_UP', renewsAt: '2026-06-16T20:00:00.000Z' },
      });
      expect(await prisma.messageAllowanceDay.count({ where: { userId: user.id } })).toBe(1);
    });

    it('24 h or more after the first message the new zone opens its own local day', async () => {
      const { user } = await freelancer(AUCKLAND);
      const auckland = await actingFreelancerForTest(user.id, AUCKLAND);
      await seedDay(user.id, 30, {
        timeZone: KYIV,
        firstMessageAt: new Date('2026-06-15T20:00:00Z'),
      });
      const r = await svc.reserveMessageSlot(auckland, new Date('2026-06-16T20:00:00Z'));
      expect(r.ok).toBe(true);
      expect(await prisma.messageAllowanceDay.count({ where: { userId: user.id } })).toBe(2);
      expect(await usedOf(user.id, new Date('2026-06-17T00:00:00.000Z'))).toBe(1);
    });

    it('getAllowanceState applies the same rule and writes nothing', async () => {
      const { user } = await freelancer(AUCKLAND);
      const auckland = await actingFreelancerForTest(user.id, AUCKLAND);
      await seedDay(user.id, 12, {
        timeZone: KYIV,
        firstMessageAt: new Date(Date.now() - 60 * 60 * 1000),
        day: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
      });
      const before = await prisma.messageAllowanceDay.findMany({ where: { userId: user.id } });
      const res = await svc.getAllowanceState(auckland);
      expect(res.success && res.data.used).toBe(12);
      expect(await prisma.messageAllowanceDay.findMany({ where: { userId: user.id } })).toEqual(before);
    });
  });
});
