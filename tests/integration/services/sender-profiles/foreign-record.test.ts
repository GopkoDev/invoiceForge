// T9 (spec.md §5 AC-08; §6 Tenant isolation) — every id-taking sender-profile function, called by
// Freelancer A with Freelancer B's id, answers exactly as for an id that never existed, and B's
// row stays byte-identical.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)('sender-profiles — foreign record (T9, AC-08)', () => {
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

  async function setup() {
    const a = await createFreelancer(prisma);
    const b = await createFreelancer(prisma);
    const foreign = await createSenderProfile(prisma, b.id, { logo: 'https://example.com/b.png' });
    const actor = await actingFreelancerForTest(a.id);
    const snapshot = JSON.stringify(await prisma.senderProfile.findUniqueOrThrow({ where: { id: foreign.id } }));
    return { actor, foreign, snapshot };
  }

  async function expectUnchanged(id: string, snapshot: string) {
    const after = await prisma.senderProfile.findUnique({ where: { id } });
    expect(JSON.stringify(after)).toBe(snapshot);
  }

  const notFound = { success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' };

  it('getSenderProfile answers like a missing id', async () => {
    const { actor, foreign, snapshot } = await setup();
    const missing = await svc.getSenderProfile(actor, 'never-existed');
    expect(await svc.getSenderProfile(actor, foreign.id)).toEqual(missing);
    expect(missing).toMatchObject(notFound);
    await expectUnchanged(foreign.id, snapshot);
  });

  it('getSenderProfileLogo answers like a missing id (no logo leak)', async () => {
    const { actor, foreign, snapshot } = await setup();
    const missing = await svc.getSenderProfileLogo(actor, 'never-existed');
    expect(await svc.getSenderProfileLogo(actor, foreign.id)).toEqual(missing);
    expect(missing).toMatchObject({ success: false, code: 'NOT_FOUND' });
    await expectUnchanged(foreign.id, snapshot);
  });

  it('updateSenderProfile answers like a missing id and changes nothing', async () => {
    const { actor, foreign, snapshot } = await setup();
    const input = { name: 'Hijacked', invoicePrefix: 'FOREIGN1', isDefault: true };
    const missing = await svc.updateSenderProfile(actor, 'never-existed', input);
    expect(await svc.updateSenderProfile(actor, foreign.id, input)).toEqual(missing);
    expect(missing).toMatchObject(notFound);
    await expectUnchanged(foreign.id, snapshot);
  });

  it('deleteSenderProfile answers like a missing id and deletes nothing', async () => {
    const { actor, foreign, snapshot } = await setup();
    const missing = await svc.deleteSenderProfile(actor, 'never-existed');
    expect(await svc.deleteSenderProfile(actor, foreign.id)).toEqual(missing);
    expect(missing).toMatchObject(notFound);
    await expectUnchanged(foreign.id, snapshot);
  });
});
