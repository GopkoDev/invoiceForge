// editor-ux T12 (spec.md §5 AC-06, AC-08; sad.md §4 "Today comes from the server", §6 Flow 5): a new
// invoice's issue day is today's calendar day in the Freelancer time zone (UTC until one is saved) and
// its due day follows from the default payment terms (30 calendar days). The server computes both and
// passes them in the editor's initial data (`initialData.issueDate` / `dueDate`, stored as midnight UTC
// of the day), so neither the process time zone nor the browser decides them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue(
      ['UTC', 'Pacific/Kiritimati', 'Pacific/Honolulu', 'Pacific/Pago_Pago'].map((name) => ({ name }))
    ),
    senderProfile: { findMany: vi.fn().mockResolvedValue([]) },
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    customPrice: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { getInvoiceEditorData } from '@/lib/services/invoices/editor-data';
import { actingFreelancerForTest } from '../../../../support/acting-freelancer';

const ORIGINAL_TZ = process.env.TZ;

async function newInvoiceDays(timeZone: string | undefined) {
  const actor = await actingFreelancerForTest('user-1', timeZone);
  const result = await getInvoiceEditorData(actor);
  if (!result.success) throw new Error(`editor data failed: ${result.error}`);
  const initial = result.data.initialData;
  expect(initial, 'a new invoice carries server-computed defaults in initialData').toBeDefined();
  return {
    issue: new Date(initial!.issueDate).toISOString(),
    due: new Date(initial!.dueDate).toISOString(),
  };
}

describe('getInvoiceEditorData for a new invoice - server-computed today (AC-06, AC-08)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  // 23:30 UTC on 2026-03-10 is already 2026-03-11 in UTC+14, still 2026-03-10 in UTC, and 2026-03-10 in UTC-10.
  it.each([
    ['Pacific/Kiritimati', '2026-03-11'],
    ['UTC', '2026-03-10'],
    ['Pacific/Honolulu', '2026-03-10'],
  ])('uses the calendar day of %s as the issue day at 23:30 UTC', async (zone, day) => {
    vi.setSystemTime(new Date('2026-03-10T23:30:00.000Z'));
    const { issue } = await newInvoiceDays(zone);
    expect(issue).toBe(`${day}T00:00:00.000Z`);
  });

  it('uses UTC when no Freelancer time zone is saved', async () => {
    vi.setSystemTime(new Date('2026-03-10T23:30:00.000Z'));
    const { issue } = await newInvoiceDays(undefined);
    expect(issue).toBe('2026-03-10T00:00:00.000Z');
  });

  it('puts the due day 30 calendar days after the issue day (default payment terms)', async () => {
    vi.setSystemTime(new Date('2026-03-10T23:30:00.000Z'));
    const { due } = await newInvoiceDays('Pacific/Kiritimati');
    expect(due).toBe('2026-04-10T00:00:00.000Z');
  });

  it.each(['Pacific/Pago_Pago', 'Pacific/Kiritimati', 'UTC'])(
    'gives the same days whatever the server process time zone (%s)',
    async (processZone) => {
      process.env.TZ = processZone;
      vi.setSystemTime(new Date('2026-03-10T23:55:00.000Z'));
      const days = await newInvoiceDays('Pacific/Kiritimati');
      expect(days).toEqual({ issue: '2026-03-11T00:00:00.000Z', due: '2026-04-10T00:00:00.000Z' });
    }
  );
});
