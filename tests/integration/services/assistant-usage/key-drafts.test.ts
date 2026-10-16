// T17 (ai-assistant; spec.md §5 AC-27, AC-28; ADR-0009) - the per-key daily draft limit counted in
// per-local-day rows: take a slot inside the caller's transaction, lift by 50 once reached.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createPersonalKey } from '../../../support/factories/personal-key';
import { createPersonalKeyDraftDay } from '../../../support/factories/personal-key-draft-day';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const KYIV = 'Europe/Kyiv'; // UTC+3 in June 2026
const NOW = new Date('2026-06-15T10:00:00Z'); // 13:00 in Kyiv, 15 June
const DAY = new Date('2026-06-15T00:00:00.000Z');
const NEXT_DAY = new Date('2026-06-16T00:00:00.000Z');
const NEXT_LOCAL_MIDNIGHT = '2026-06-15T21:00:00.000Z'; // 00:00 on 16 June in Kyiv

type Slot =
  | { ok: true }
  | { ok: false; details: { kind: 'DRAFT_LIMIT_REACHED'; created: number; allowance: number; renewsAt: string } };
type Lifted =
  | { success: true; data: { created: number; allowance: number; lastLiftedAt: string } }
  | { success: false; code: string; error: string };
type Svc = {
  takeKeyDraftSlot: (tx: Prisma.TransactionClient, key: { id: string }, zone: string, now: Date) => Promise<Slot>;
  liftKeyDraftLimit: (actor: unknown, keyId: string, now: Date) => Promise<Lifted>;
};
type Listed = {
  success: boolean;
  data: {
    active: {
      id: string;
      draftsToday: { created: number; allowance: number; lastLiftedAt: string | null } | null;
    }[];
  };
};

describe.runIf(containerRuntimeAvailable)('Per-key daily draft limit (T17)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let listPersonalKeys: (actor: unknown) => Promise<Listed>;
  let todayInZone: (zone: string, now?: Date) => string;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-usage/key-drafts')) as unknown as Svc;
    listPersonalKeys = (await import('@/lib/services/personal-keys/personal-keys'))
      .listPersonalKeys as unknown as typeof listPersonalKeys;
    todayInZone = (await import('@/lib/helpers/calendar-day')).todayInZone;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup(email = 't17@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: KYIV });
    const actor = await actingFreelancerForTest(user.id, KYIV);
    const { row: key } = await createPersonalKey(prisma, user.id, { canCreateDrafts: true });
    return { user, actor, key };
  }

  const take = (keyId: string, now = NOW) =>
    prisma.$transaction((tx) => svc.takeKeyDraftSlot(tx, { id: keyId }, KYIV, now));

  const rowOf = (keyId: string, day = DAY) =>
    prisma.personalKeyDraftDay.findUniqueOrThrow({ where: { personalKeyId_day: { personalKeyId: keyId, day } } });

  describe('takeKeyDraftSlot (AC-27)', () => {
    it('takes 50 slots in a day and refuses the 51st with the counts and the next local midnight', async () => {
      const { key } = await setup();
      for (let i = 0; i < 50; i++) expect(await take(key.id)).toEqual({ ok: true });
      expect(await take(key.id)).toEqual({
        ok: false,
        details: { kind: 'DRAFT_LIMIT_REACHED', created: 50, allowance: 50, renewsAt: NEXT_LOCAL_MIDNIGHT },
      });
      expect((await rowOf(key.id)).created).toBe(50);
    });

    it('rolls the slot back with the outer transaction', async () => {
      const { key } = await setup();
      await expect(
        prisma.$transaction(async (tx) => {
          expect(await svc.takeKeyDraftSlot(tx, { id: key.id }, KYIV, NOW)).toEqual({ ok: true });
          throw new Error('invoice failed');
        })
      ).rejects.toThrow('invoice failed');
      const after = await prisma.personalKeyDraftDay.findUnique({
        where: { personalKeyId_day: { personalKeyId: key.id, day: DAY } },
      });
      expect(after?.created ?? 0).toBe(0);
    });

    it('never exceeds the limit under concurrency', async () => {
      const { key } = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 45 });
      const results = await Promise.all(Array.from({ length: 12 }, () => take(key.id)));
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect((await rowOf(key.id)).created).toBe(50);
    });

    it('counts per key: another key of the same Freelancer is unaffected', async () => {
      const { user, key } = await setup();
      const { row: other } = await createPersonalKey(prisma, user.id, { canCreateDrafts: true });
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 50 });
      expect((await take(key.id)).ok).toBe(false);
      expect(await take(other.id)).toEqual({ ok: true });
    });

    it('starts the next local day at 50 with a new row', async () => {
      const { key } = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 50, allowance: 100 });
      const nextLocalDay = new Date('2026-06-15T21:30:00Z'); // 00:30 on 16 June in Kyiv
      expect(await take(key.id, nextLocalDay)).toEqual({ ok: true });
      const row = await rowOf(key.id, NEXT_DAY);
      expect(row.created).toBe(1);
      expect(row.allowance).toBe(50);
    });
  });

  describe('liftKeyDraftLimit (AC-28)', () => {
    it('refuses with CONFLICT before the limit is reached and changes nothing', async () => {
      const { actor, key } = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 49 });
      const res = await svc.liftKeyDraftLimit(actor, key.id, NOW);
      expect(res).toMatchObject({ success: false, code: 'CONFLICT' });
      const row = await rowOf(key.id);
      expect(row.allowance).toBe(50);
      expect(row.lastLiftedAt).toBeNull();
    });

    it('with no row today the limit is not reached: CONFLICT', async () => {
      const { actor, key } = await setup();
      expect(await svc.liftKeyDraftLimit(actor, key.id, NOW)).toMatchObject({ success: false, code: 'CONFLICT' });
    });

    it('at 50 lifts to 100 for today with lastLiftedAt, and the key can create 50 more', async () => {
      const { actor, key } = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 50 });
      expect(await svc.liftKeyDraftLimit(actor, key.id, NOW)).toEqual({
        success: true,
        data: { created: 50, allowance: 100, lastLiftedAt: NOW.toISOString() },
      });
      for (let i = 0; i < 50; i++) expect(await take(key.id)).toEqual({ ok: true });
      expect((await take(key.id)).ok).toBe(false);
    });

    it('lifts again at 100 created: 150', async () => {
      const { actor, key } = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 100, allowance: 100 });
      const res = await svc.liftKeyDraftLimit(actor, key.id, NOW);
      expect(res).toMatchObject({ success: true, data: { allowance: 150 } });
    });

    it('a parallel double lift lifts once; the other call is CONFLICT', async () => {
      const { actor, key } = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 50 });
      const [a, b] = await Promise.all([
        svc.liftKeyDraftLimit(actor, key.id, NOW),
        svc.liftKeyDraftLimit(actor, key.id, NOW),
      ]);
      expect([a.success, b.success].sort()).toEqual([false, true]);
      const failure = a.success ? b : a;
      expect(failure).toMatchObject({ success: false, code: 'CONFLICT' });
      expect((await rowOf(key.id)).allowance).toBe(100);
    });

    it('does not carry over: the next local day starts at 50', async () => {
      const { actor, key } = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: key.id, day: DAY, created: 50 });
      await svc.liftKeyDraftLimit(actor, key.id, NOW);
      expect(await take(key.id, new Date('2026-06-15T21:30:00Z'))).toEqual({ ok: true });
      expect((await rowOf(key.id, NEXT_DAY)).allowance).toBe(50);
    });

    it('answers NOT_FOUND for another Freelancer key, an unknown key, a revoked key and a read-only key', async () => {
      const { actor, key } = await setup();
      const stranger = await createFreelancer(prisma, { email: 'other17@example.com', timeZone: KYIV });
      const { row: foreign } = await createPersonalKey(prisma, stranger.id, { canCreateDrafts: true });
      const { row: revoked } = await createPersonalKey(prisma, actor.userId, { canCreateDrafts: true, revoked: true });
      const { row: readOnly } = await createPersonalKey(prisma, actor.userId, { canCreateDrafts: false });
      for (const k of [foreign, revoked, readOnly]) {
        await createPersonalKeyDraftDay(prisma, { personalKeyId: k.id, day: DAY, created: 50 });
      }
      for (const id of [foreign.id, revoked.id, readOnly.id, 'no-such-key']) {
        expect(await svc.liftKeyDraftLimit(actor, id, NOW)).toMatchObject({ success: false, code: 'NOT_FOUND' });
      }
      expect((await rowOf(foreign.id)).allowance).toBe(50);
      expect(key.id).toBeTruthy();
    });
  });

  describe('listPersonalKeys draftsToday', () => {
    it('is null for read-only keys, zeros with the latest earlier lift when no row today, and the row otherwise', async () => {
      const { user, actor, key } = await setup();
      const { row: readOnly } = await createPersonalKey(prisma, user.id, { canCreateDrafts: false });
      const { row: busy } = await createPersonalKey(prisma, user.id, { canCreateDrafts: true });
      const today = new Date(`${todayInZone(KYIV)}T00:00:00.000Z`);
      const earlier = new Date(today.getTime() - 3 * 86_400_000);
      const lifted = new Date(earlier.getTime() + 36_000_000);
      await createPersonalKeyDraftDay(prisma, {
        personalKeyId: key.id,
        day: earlier,
        created: 50,
        allowance: 100,
        lastLiftedAt: lifted,
      });
      await createPersonalKeyDraftDay(prisma, { personalKeyId: busy.id, day: today, created: 7 });

      const res = await listPersonalKeys(actor);
      const by = Object.fromEntries(res.data.active.map((k) => [k.id, k.draftsToday]));
      expect(by[readOnly.id]).toBeNull();
      expect(by[key.id]).toEqual({ created: 0, allowance: 50, lastLiftedAt: lifted.toISOString() });
      expect(by[busy.id]).toEqual({ created: 7, allowance: 50, lastLiftedAt: null });
    });
  });
});
