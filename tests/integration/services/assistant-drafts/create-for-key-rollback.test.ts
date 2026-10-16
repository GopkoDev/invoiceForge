// T21 (ai-assistant; ADR-0009): createDraftForKey is one transaction - a failure after the key slot and the
// invoice rolls all of it back.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createPersonalKey } from '../../../support/factories/personal-key';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';


describe.runIf(containerRuntimeAvailable)('createDraftForKey rollback (T21)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    vi.doUnmock('@/lib/services/assistant-drafts/repeat-marks');
    await prisma?.$disconnect();
    await db?.stop();
  });

  it('a failure after the slot and the invoice rolls back the invoice, the slot and the repeat row', async () => {
    vi.doMock('@/lib/services/assistant-drafts/repeat-marks', () => ({
      readRepeatMark: async () => null,
      writeRepeatMark: async () => {
        throw new Error('boom');
      },
    }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { createDraftForKey } = await import('@/lib/services/assistant-drafts/create-for-key');
    const user = await createFreelancer(prisma, { email: 't21r@example.com', timeZone: TZ });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'USD' });
    await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    const { row } = await createPersonalKey(prisma, user.id, { name: 'K', canCreateDrafts: true });
    const actor = await actingFreelancerForTest(user.id, TZ);

    const res = await createDraftForKey(
      actor,
      { id: row.id, name: row.name, canCreateDrafts: true },
      { customer: 'Acme', lines: [{ description: 'x', quantity: '1', unit: 'hours', price: '5' }], repeatKey: 'rb' },
      new Date()
    );

    expect(res).toMatchObject({ success: false, code: 'FAILED' });
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.personalKeyDraftDay.count()).toBe(0);
    expect(await prisma.mcpDraftRepeat.count()).toBe(0);
  });
});
