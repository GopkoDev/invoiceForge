// editor-ux T22 (spec.md §5 AC-06; sad.md §6 Flow 5; review 2026-10-10 D2): a new invoice opens with the
// default sender profile (else the first), its default bank account (else the first) and that account's
// currency, from the first display. With no profile the ids stay empty.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ name: 'UTC' }]),
    senderProfile: { findMany: vi.fn() },
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    customPrice: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { prisma } from '@/prisma';
import { getInvoiceEditorData } from '@/lib/services/invoices/editor-data';
import { actingFreelancerForTest } from '../../../../support/acting-freelancer';

const account = (id: string, currency: string, isDefault: boolean) => ({
  id, senderProfileId: 'x', bankName: 'B', accountName: 'N', accountNumber: '1', iban: null, swift: null, currency, isDefault,
});
const profile = (id: string, isDefault: boolean, bankAccounts: ReturnType<typeof account>[]) => ({
  id, name: id, legalName: null, address: null, city: null, country: null, postalCode: null, email: null,
  phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 1, isDefault, bankAccounts,
});

async function newForm(profiles: unknown[]) {
  vi.mocked(prisma.senderProfile.findMany).mockResolvedValue(profiles as never);
  const result = await getInvoiceEditorData(await actingFreelancerForTest('user-1', 'UTC'));
  if (!result.success) throw new Error(`editor data failed: ${result.error}`);
  return result.data.initialData!;
}

describe('getInvoiceEditorData new-invoice sender and bank defaults (AC-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('picks the default profile, its default bank account and that account currency', async () => {
    const form = await newForm([
      profile('A', true, [account('a1', 'USD', false), account('a2', 'EUR', true)]),
      profile('B', false, [account('b1', 'GBP', true)]),
    ]);
    expect(form.senderProfileId).toBe('A');
    expect(form.bankAccountId).toBe('a2');
    expect(form.currency).toBe('EUR');
  });

  it('falls back to the first profile and its first account when none is default', async () => {
    const form = await newForm([
      profile('A', false, [account('a1', 'GBP', false), account('a2', 'EUR', false)]),
      profile('B', false, [account('b1', 'USD', false)]),
    ]);
    expect(form.senderProfileId).toBe('A');
    expect(form.bankAccountId).toBe('a1');
    expect(form.currency).toBe('GBP');
  });

  it('keeps empty ids and USD when there is no profile', async () => {
    const form = await newForm([]);
    expect(form.senderProfileId).toBe('');
    expect(form.bankAccountId).toBe('');
    expect(form.currency).toBe('USD');
  });
});
