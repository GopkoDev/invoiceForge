// T22 (review 2026-10-01 S-05; spec.md §5 AC-08, AC-19; ADR-0003) — the numbering helpers carry the
// owner in their own SQL: called with another Freelancer's sender profile they match zero rows and
// answer SenderProfileNotFoundError (NOT_FOUND at the service edge), never a TypeError, and never
// advance the other Freelancer's invoiceCounter.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Numbering = {
  allocateInvoiceNumber: (tx: unknown, senderProfileId: string, userId: string) => Promise<unknown>;
  lockSenderProfileRow: (tx: unknown, senderProfileId: string, userId: string) => Promise<void>;
  peekNextInvoiceNumber: (senderProfileId: string, userId: string) => Promise<string | null>;
  SenderProfileNotFoundError: new () => Error;
};

describe.runIf(containerRuntimeAvailable)('numbering helpers are owner-scoped (T22, S-05)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let numbering: Numbering;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    numbering = (await import('@/lib/services/invoices/numbering')) as unknown as Numbering;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seedTwo() {
    const a = await createFreelancer(prisma, { email: 't22-a@example.com' });
    const b = await createFreelancer(prisma, { email: 't22-b@example.com' });
    const profileA = await createSenderProfile(prisma, a.id, { invoiceCounter: 4 });
    const profileB = await createSenderProfile(prisma, b.id, { invoiceCounter: 4 });
    return { a, b, profileA, profileB };
  }
  const counter = async (id: string) =>
    (await prisma.senderProfile.findUniqueOrThrow({ where: { id } })).invoiceCounter;

  it("allocateInvoiceNumber with B's profile as A is SenderProfileNotFoundError, B's counter unchanged", async () => {
    const { a, profileB } = await seedTwo();
    await expect(
      prisma.$transaction((tx) => numbering.allocateInvoiceNumber(tx, profileB.id, a.id))
    ).rejects.toBeInstanceOf(numbering.SenderProfileNotFoundError);
    expect(await counter(profileB.id)).toBe(4);
  });

  it("lockSenderProfileRow with B's profile as A is SenderProfileNotFoundError", async () => {
    const { a, profileB } = await seedTwo();
    await expect(
      prisma.$transaction((tx) => numbering.lockSenderProfileRow(tx, profileB.id, a.id))
    ).rejects.toBeInstanceOf(numbering.SenderProfileNotFoundError);
    expect(await counter(profileB.id)).toBe(4);
  });

  it("peekNextInvoiceNumber with B's profile as A is null, B's counter unchanged", async () => {
    const { a, profileB } = await seedTwo();
    expect(await numbering.peekNextInvoiceNumber(profileB.id, a.id)).toBeNull();
    expect(await counter(profileB.id)).toBe(4);
  });

  it("the owner still allocates, locks and peeks on their own profile", async () => {
    const { a, profileA } = await seedTwo();
    const allocated = (await prisma.$transaction((tx) =>
      numbering.allocateInvoiceNumber(tx, profileA.id, a.id)
    )) as { invoiceNumber: string };
    expect(allocated.invoiceNumber).toContain(profileA.invoicePrefix);
    expect(await counter(profileA.id)).toBe(5);
    await prisma.$transaction((tx) => numbering.lockSenderProfileRow(tx, profileA.id, a.id));
    expect(await numbering.peekNextInvoiceNumber(profileA.id, a.id)).toContain('0006');
  });
});
