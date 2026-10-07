// T24 (AC-08): Freelancer A's key never reveals Freelancer B's records through any tool: every probe
// with B's references answers exactly as the same probe with a reference that does not exist.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { truncateAllTables } from '../../support/db/truncate';
import { createPersonalKey } from '../../support/factories/personal-key';
import { createCustomer } from '../../support/factories/customer';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createBankAccount } from '../../support/factories/bank-account';
import { createFreelancer } from '../../support/factories/user';
import { startMcpHarness, type McpHarness, type ToolResult } from '../../support/mcp-e2e';
import { addInvoice, type Seed } from '../services/dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)('Tenant isolation through every tool (T24, AC-08)', () => {
  let h: McpHarness;
  let keyA: string;
  let b: { invoiceId: string; number: string; profileName: string; customerId: string; customerName: string; profileId: string };
  let sameNumberProfileA: string;

  beforeAll(async () => {
    h = await startMcpHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.stop();
  });

  async function seedTenant(label: string): Promise<Seed> {
    const user = await createFreelancer(h.factoryPrisma);
    const profile = await createSenderProfile(h.factoryPrisma, user.id, { name: `${label} Studio` });
    const bank = await createBankAccount(h.factoryPrisma, profile.id, { currency: 'USD', isDefault: true });
    const customer = await createCustomer(h.factoryPrisma, user.id, { name: `${label} Customer Ltd` });
    return { prisma: h.factoryPrisma, userId: user.id, profileId: profile.id, profile, bank: { USD: bank }, customer };
  }

  beforeEach(async () => {
    await truncateAllTables(h.factoryPrisma);
    const a = await seedTenant('Alpha');
    const bb = await seedTenant('Bravo');
    sameNumberProfileA = a.profile.name;
    await addInvoice(a, { currency: 'USD', status: 'OVERDUE', total: 10, dueDate: new Date('2020-01-01T00:00:00Z') });
    const inv = await addInvoice(bb, { currency: 'USD', status: 'OVERDUE', total: 999.99, dueDate: new Date('2020-01-01T00:00:00Z') });
    await addInvoice(bb, { currency: 'USD', status: 'PENDING', total: 777.77, dueDate: new Date('2099-01-01T00:00:00Z') });
    b = {
      invoiceId: inv.id,
      number: inv.invoiceNumber,
      profileName: bb.profile.name,
      profileId: bb.profileId,
      customerId: bb.customer.id,
      customerName: bb.customer.name,
    };
    ({ fullKey: keyA } = await createPersonalKey(h.factoryPrisma, a.userId));
  });

  const strip = (r: ToolResult) => JSON.stringify({ isError: r.isError, body: r.structuredContent });

  /** Each probe is [tool, args with B's reference, the same args with an unknown reference]. */
  const probes = (): Array<[string, string, Record<string, unknown>, Record<string, unknown>]> => [
    ['get_invoice', 'B invoice id', { invoiceId: b.invoiceId }, { invoiceId: 'cmunknown00000000000000000' }],
    ['get_invoice', 'B invoice number', { invoiceNumber: b.number }, { invoiceNumber: 'ZZ-999999' }],
    [
      'get_invoice',
      'B invoice number with B sender profile name',
      { invoiceNumber: b.number, senderProfile: b.profileName },
      { invoiceNumber: 'ZZ-999999', senderProfile: 'Nonexistent Studio' },
    ],
    [
      'get_invoice',
      'B invoice number with A sender profile name',
      { invoiceNumber: b.number, senderProfile: sameNumberProfileA },
      { invoiceNumber: 'ZZ-999999', senderProfile: sameNumberProfileA },
    ],
    ['list_customers', 'B Customer name', { name: b.customerName }, { name: 'Nonexistent Customer Ltd' }],
    ['list_customers', 'part of B Customer name', { name: 'Bravo' }, { name: 'Zulu' }],
    ['search_invoices', 'B Customer name', { customer: b.customerName }, { customer: 'Nonexistent Customer Ltd' }],
    ['search_invoices', 'B Customer id', { customerId: b.customerId }, { customerId: 'cmunknown00000000000000000' }],
    ['search_invoices', 'B sender profile name', { senderProfile: b.profileName }, { senderProfile: 'Nonexistent Studio' }],
    ['search_invoices', 'B sender profile id', { senderProfileId: b.profileId }, { senderProfileId: 'cmunknown00000000000000000' }],
    ['search_invoices', 'B invoice number', { invoiceNumber: b.number }, { invoiceNumber: 'ZZ-999999' }],
  ];

  it('answers every probe with B’s reference exactly as the one with an unknown reference', async () => {
    for (const [tool, label, withB, unknown] of probes()) {
      const rb = await h.call(keyA, tool, withB);
      const ru = await h.call(keyA, tool, unknown);
      expect(strip(rb), `${tool}: ${label}`).toBe(strip(ru));
    }
  });

  it('get_invoice answers B’s references with NOT_FOUND', async () => {
    for (const args of [
      { invoiceId: b.invoiceId },
      { invoiceNumber: b.number },
      { invoiceNumber: b.number, senderProfile: b.profileName },
    ]) {
      const r = await h.call(keyA, 'get_invoice', args);
      expect(r.isError).toBe(true);
      expect(r.structuredContent.code).toBe('NOT_FOUND');
    }
  });

  it('no tool answer for A contains any of B’s ids, names, numbers or amounts', async () => {
    const answers: string[] = [];
    for (const [tool, , withB] of probes()) answers.push(JSON.stringify((await h.call(keyA, tool, withB)).structuredContent));
    for (const tool of ['list_overdue_invoices', 'list_debtors', 'list_expected_payments', 'get_summary_figures', 'list_customers', 'search_invoices']) {
      answers.push(JSON.stringify((await h.call(keyA, tool, {})).structuredContent));
    }
    const everything = answers.join('\n');
    for (const secret of [b.invoiceId, b.number, b.profileName, b.profileId, b.customerId, b.customerName, '999.99', '777.77', '1777.76']) {
      expect(everything, secret).not.toContain(secret);
    }
    // A's own figures are there, so the absence above is not an empty answer.
    expect(everything).toContain('10.00');
  });
});
