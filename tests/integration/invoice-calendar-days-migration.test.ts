// T25 (spec.md §1, §5 AC-12, AC-23b; review-2026-10-05 F-02) — the backfill that turns every stored
// Invoice.issueDate / dueDate into the calendar day (T00:00:00Z) its owner saw, read in the owner's
// saved time zone. Owners with no saved (or an unknown) zone are left alone: their values are
// normalised lazily when the zone is first saved (T35, review-2026-10-05 G-01). Runs the migration's SQL
// on seeded rows.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createCustomer } from '../support/factories/customer';
import { createBankAccount } from '../support/factories/bank-account';
import { createInvoice } from '../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const MIGRATION = '20261005100000_normalize_invoice_calendar_dates';
const sql = fs.readFileSync(path.resolve(process.cwd(), 'prisma/migrations', MIGRATION, 'migration.sql'), 'utf8');

describe.runIf(containerRuntimeAvailable)('normalize invoice calendar dates migration (T25)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  let seq = 0;
  async function ownerWith(timeZone: string | null, rows: Array<{ issueDate: string; dueDate: string }>) {
    const user = await createFreelancer(prisma, { timeZone });
    const senderProfile = await createSenderProfile(prisma, user.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: 'C' });
    const ids: string[] = [];
    for (const r of rows) {
      seq += 1;
      const inv = await createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: {
          invoiceNumber: `T25-${seq}`,
          status: 'PENDING',
          issueDate: new Date(r.issueDate),
          dueDate: new Date(r.dueDate),
        },
      });
      ids.push(inv.id);
    }
    return ids;
  }

  async function days(ids: string[]) {
    const rows = await prisma.invoice.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => [byId.get(id)!.issueDate.toISOString(), byId.get(id)!.dueDate.toISOString()]);
  }

  const run = () => prisma.$executeRawUnsafe(sql);

  it('a Kyiv local-midnight row and a time-of-day row become the day the Kyiv owner saw', async () => {
    const ids = await ownerWith('Europe/Kyiv', [
      // The editor stored the browser's local midnight: 15 Oct 00:00 in Kyiv is 14 Oct 21:00Z (EEST).
      { issueDate: '2026-09-30T21:00:00.000Z', dueDate: '2026-10-14T21:00:00.000Z' },
      // A time of day: 01:30 on 15 Oct in Kyiv is still 14 Oct in UTC.
      { issueDate: '2026-10-14T22:30:00.000Z', dueDate: '2026-11-14T22:30:00.000Z' },
      // Winter time (EET, UTC+2): 15 Dec 00:00 in Kyiv is 14 Dec 22:00Z.
      { issueDate: '2026-12-14T22:00:00.000Z', dueDate: '2026-12-14T22:00:00.000Z' },
    ]);
    await run();
    expect(await days(ids)).toEqual([
      ['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z'],
      ['2026-10-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'],
      ['2026-12-15T00:00:00.000Z', '2026-12-15T00:00:00.000Z'],
    ]);
  });

  it('a New York owner (west of UTC) keeps the day of the local instant, not the next UTC day', async () => {
    const ids = await ownerWith('America/New_York', [
      // 15 Oct 00:00 in New York (EDT, UTC-4) is 04:00Z the same day.
      { issueDate: '2026-10-15T04:00:00.000Z', dueDate: '2026-10-15T04:00:00.000Z' },
      // 22:00 on 15 Oct in New York is 02:00Z on the 16th.
      { issueDate: '2026-10-16T02:00:00.000Z', dueDate: '2026-11-01T03:59:59.000Z' },
    ]);
    await run();
    expect(await days(ids)).toEqual([
      ['2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'],
      ['2026-10-15T00:00:00.000Z', '2026-10-31T00:00:00.000Z'],
    ]);
  });

  it('G-01: an owner with no saved zone keeps the original instants, while a Kyiv-zone owner is converted', async () => {
    const row = { issueDate: '2026-09-30T21:00:00.000Z', dueDate: '2026-10-14T21:00:00.000Z' };
    const none = await ownerWith(null, [row]);
    const kyiv = await ownerWith('Europe/Kyiv', [row]);
    await run();
    expect(await days(none)).toEqual([[row.issueDate, row.dueDate]]);
    expect(await days(kyiv)).toEqual([['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z']]);
  });

  it('G-01: an owner whose saved zone the database does not know is left alone, with no UTC fallback', async () => {
    const row = { issueDate: '2026-10-15T23:30:00.000Z', dueDate: '2026-10-16T00:30:00.000Z' };
    const unknown = await ownerWith('Mars/Olympus', [row]);
    await run();
    expect(await days(unknown)).toEqual([[row.issueDate, row.dueDate]]);
  });

  it('is idempotent: a second run changes nothing, for a zone west of UTC as well', async () => {
    const west = await ownerWith('America/New_York', [{ issueDate: '2026-10-15T04:00:00.000Z', dueDate: '2026-10-16T02:00:00.000Z' }]);
    const east = await ownerWith('Europe/Kyiv', [{ issueDate: '2026-09-30T21:00:00.000Z', dueDate: '2026-10-14T21:00:00.000Z' }]);
    await run();
    const once = [await days(west), await days(east)];
    await run();
    expect([await days(west), await days(east)]).toEqual(once);
    expect(once[0]).toEqual([['2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z']]);
  });

  it('leaves a value that is already a UTC-midnight day alone', async () => {
    const ids = await ownerWith('America/New_York', [{ issueDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-15T00:00:00.000Z' }]);
    await run();
    expect(await days(ids)).toEqual([['2026-10-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z']]);
  });
});
