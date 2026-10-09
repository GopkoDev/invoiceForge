// invoice-integrity T11 (spec.md §5 AC-17, AC-17b; §6 NFR "Default uniqueness"; ADR-0005) — exactly one
// default sender profile per Freelancer, under the User row lock: the first is the default, a switch
// clears and sets in one transaction (a failure keeps the old default), deleting the default promotes
// the earliest-created remaining one, unsetting without a replacement is refused, and 10 parallel
// set-default requests leave exactly one default.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { commitWhileBlocked } from '../../../support/db/row-lock-race';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const UNSET_MESSAGE = "The default sender profile can't be switched off. Make another profile the default instead.";

describe.runIf(containerRuntimeAvailable)('single default sender profile (T11, AC-17, AC-17b)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: typeof import('@/lib/services/sender-profiles/sender-profiles');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/sender-profiles/sender-profiles');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  let prefixSeq = 0;
  const form = (over: Record<string, unknown> = {}) => ({
    name: 'Studio',
    invoicePrefix: `SD${++prefixSeq}`,
    isDefault: false,
    ...over,
  });
  // The factory's prefixes are longer than the form allows, so a save sends a fresh short one.
  const formOf = (p: { name: string; isDefault: boolean }, over: Record<string, unknown> = {}) => ({
    name: p.name,
    invoicePrefix: `SD${++prefixSeq}`,
    isDefault: p.isDefault,
    ...over,
  });

  async function defaults(userId: string) {
    const rows = await prisma.senderProfile.findMany({ where: { userId, isDefault: true }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  it('AC-17b: the first profile is the default whatever was sent; a later one is not unless asked', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const first = await svc.createSenderProfile(actor, form({ isDefault: false }));
    const second = await svc.createSenderProfile(actor, form({ isDefault: false }));
    expect(first.success && first.data.isDefault).toBe(true);
    expect(second.success && second.data.isDefault).toBe(false);
    expect(await defaults(user.id)).toEqual([first.success && first.data.id]);
  });

  it('AC-17: creating with isDefault switches the default', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    await svc.createSenderProfile(actor, form());
    const b = await svc.createSenderProfile(actor, form({ isDefault: true }));
    expect(await defaults(user.id)).toEqual([b.success && b.data.id]);
  });

  it('AC-17: making B the default clears A; a repeated request finds B default and succeeds', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const a = await createSenderProfile(prisma, user.id);
    const b = await createSenderProfile(prisma, user.id);
    expect(await svc.updateSenderProfile(actor, b.id, formOf(b, { isDefault: true }))).toMatchObject({ success: true });
    expect(await svc.updateSenderProfile(actor, b.id, formOf(b, { isDefault: true }))).toMatchObject({ success: true });
    expect(await defaults(user.id)).toEqual([b.id]);
    expect(a.isDefault).toBe(true);
  });

  it('AC-17: if making B the default fails, A stays the default', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const a = await createSenderProfile(prisma, user.id);
    const b = await createSenderProfile(prisma, user.id);
    await prisma.$executeRawUnsafe(`ALTER TABLE "SenderProfile" ADD CONSTRAINT t11_fail CHECK (name <> 'boom')`);
    try {
      const res = await svc.updateSenderProfile(actor, b.id, formOf(b, { isDefault: true, name: 'boom' }));
      expect(res.success).toBe(false);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "SenderProfile" DROP CONSTRAINT t11_fail`);
    }
    expect(await defaults(user.id)).toEqual([a.id]);
  });

  it('AC-17b: the default cannot be switched off without choosing another', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const a = await createSenderProfile(prisma, user.id);
    const b = await createSenderProfile(prisma, user.id);
    const res = await svc.updateSenderProfile(actor, a.id, formOf(a, { isDefault: false, name: 'Renamed' }));
    expect(res).toEqual({
      success: false,
      code: 'VALIDATION',
      error: UNSET_MESSAGE,
      fieldErrors: { isDefault: [UNSET_MESSAGE] },
    });
    expect((await prisma.senderProfile.findUniqueOrThrow({ where: { id: a.id } })).name).toBe(a.name);
    // Unsetting a profile that isn't the default is an ordinary update.
    expect((await svc.updateSenderProfile(actor, b.id, formOf(b, { name: 'B renamed' }))).success).toBe(true);
  });

  it('AC-17b: deleting the default promotes the earliest-created remaining profile; deleting another does not', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const a = await createSenderProfile(prisma, user.id);
    const b = await createSenderProfile(prisma, user.id);
    const c = await createSenderProfile(prisma, user.id);
    await prisma.senderProfile.update({ where: { id: c.id }, data: { createdAt: new Date('2020-01-01T00:00:00Z') } });

    expect((await svc.deleteSenderProfile(actor, b.id)).success).toBe(true);
    expect(await defaults(user.id)).toEqual([a.id]);

    expect((await svc.deleteSenderProfile(actor, a.id)).success).toBe(true);
    expect(await defaults(user.id)).toEqual([c.id]);

    expect((await svc.deleteSenderProfile(actor, c.id)).success).toBe(true);
    expect(await prisma.senderProfile.count({ where: { userId: user.id } })).toBe(0);
  });

  it('NFR: 10 parallel set-default requests leave exactly one default', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const profiles: Awaited<ReturnType<typeof createSenderProfile>>[] = [];
    for (let i = 0; i < 5; i++) profiles.push(await createSenderProfile(prisma, user.id));
    const requests = Array.from({ length: 10 }, (_, i) => {
      const p = profiles[i % profiles.length];
      return svc.updateSenderProfile(actor, p.id, formOf(p, { isDefault: true }));
    });
    const results = await Promise.all(requests);
    for (const r of results) expect(r.success || r.code === 'CONFLICT').toBe(true);
    expect(await defaults(user.id)).toHaveLength(1);
  });

  it('a unique hit on the default index is a retryable CONFLICT, never FAILED', async () => {
    const mod = await import('@/lib/services/sender-profiles/sender-profiles');
    expect(mod.defaultConflict()).toEqual({
      success: false,
      code: 'CONFLICT',
      error: "Couldn't change the default sender profile. Please try again.",
    });
  });

  // T29 (review 2026-10-08 S3): a real P2002 from SenderProfile_userId_isDefault_key. A side transaction
  // skips the User lock, moves the default A -> C and stays open; updateSenderProfile(B -> default) takes
  // the lock, blocks clearing A, resumes after the commit (A no longer default, C unseen) and hits the
  // index when it sets B.
  it('T29: a real unique hit on the default index (a write that skipped the lock) is the retryable CONFLICT, not FAILED', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const a = await createSenderProfile(prisma, user.id, { isDefault: true });
    const b = await createSenderProfile(prisma, user.id, { isDefault: false });
    const c = await createSenderProfile(prisma, user.id, { isDefault: false });

    const result = await commitWhileBlocked(
      prisma,
      async (tx) => {
        await tx.senderProfile.update({ where: { id: a.id }, data: { isDefault: false } });
        await tx.senderProfile.update({ where: { id: c.id }, data: { isDefault: true } });
      },
      () => svc.updateSenderProfile(actor, b.id, formOf(b, { isDefault: true })),
    );

    expect(result).toEqual(svc.defaultConflict());
    expect(result).toMatchObject({ success: false, code: 'CONFLICT' });
    // The failed switch rolled back: the default the side transaction committed stays the only one.
    expect(await defaults(user.id)).toEqual([c.id]);
  });

  it('T29: isDefaultIndexConflict reads the index from the real Prisma error, and only for the default index', async () => {
    const user = await createFreelancer(prisma);
    const first = await createSenderProfile(prisma, user.id, { isDefault: true });
    const second = await createSenderProfile(prisma, user.id, { isDefault: false });

    const defaultHit = await prisma.senderProfile
      .update({ where: { id: second.id }, data: { isDefault: true } })
      .catch((e: unknown) => e);
    expect(defaultHit).toMatchObject({ code: 'P2002' });
    expect(svc.isDefaultIndexConflict(defaultHit)).toBe(true);

    // Another unique index on the same table (invoicePrefix) is a P2002 too, but not the default CONFLICT.
    const prefixHit = await prisma.senderProfile
      .update({ where: { id: second.id }, data: { invoicePrefix: first.invoicePrefix } })
      .catch((e: unknown) => e);
    expect(prefixHit).toMatchObject({ code: 'P2002' });
    expect(svc.isDefaultIndexConflict(prefixHit)).toBe(false);
  });
});

describe.runIf(!containerRuntimeAvailable)('single default sender profile (T11)', () => {
  it.skip('skipped: no container runtime', () => {});
});
