// T27 (ai-assistant, AC-12, AC-15, AC-19, AC-20, AC-21, AC-22): the chat's only write-shaped tool
// carries the Freelancer's own words to the resolver. A complete request parks a pending card on
// the turn context (saveTurn persists it later); an incomplete one comes back as questions.
// The tool never creates an invoice and never writes a card itself. No model: the tool is called
// directly, as the agent's tool loop would.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';

describe.runIf(containerRuntimeAvailable)('propose_draft tool (T27)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup() {
    const user = await createFreelancer(prisma, { email: 't27-a@example.com', timeZone: TZ });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'USD' });
    const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    const actor = await actingFreelancerForTest(user.id, TZ);
    const { createTurnContext } = await import('@/lib/ai/turn-context');
    const { createProposeDraftTool } = await import('@/lib/ai/tools/propose-draft');
    const turn = createTurnContext({ actor, today: TODAY });
    const tool = createProposeDraftTool(turn) as { description?: string; inputSchema: any; execute?: (i: any, c: any) => Promise<any> };
    const call = (input: Record<string, unknown>) => tool.execute!(input, {});
    return { user, profile, acme, turn, tool, call };
  }

  const consulting = { customer: 'Acme', lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }] };

  it('AC-12: a complete request answers CARD and parks a pending card {id, request, proposal}', async () => {
    const { turn, call } = await setup();

    const out = await call(consulting);

    expect(out.kind).toBe('CARD');
    expect(typeof out.cardId).toBe('string');
    const card = turn.pending.card as any;
    expect(card.id).toBe(out.cardId);
    expect(card.request).toEqual(consulting);
    expect(card.proposal.total).toBe('1000.00');
    expect(card.proposal.currency).toBe('USD');
    expect(card.proposal.lines[0]).toMatchObject({ quantity: '20.00', rate: '50.00', amount: '1000.00' });
  });

  it('AC-12: the tool creates no invoice and writes no card of its own', async () => {
    const { call } = await setup();

    await call(consulting);

    expect(await prisma.invoice.count()).toBe(0);
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public' and tablename ilike '%card%'`;
    for (const { tablename } of tables) {
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from "${tablename}"`);
      expect(Number(n)).toBe(0);
    }
  });

  it('AC-19: "600 EUR for the logo design" names the EUR account in the pending proposal', async () => {
    const { profile, turn, call } = await setup();
    await createBankAccount(prisma, profile.id, { currency: 'EUR' });

    const out = await call({ customer: 'Acme', currency: 'EUR', lines: [{ description: 'logo design', price: '600' }] });

    expect(out.kind).toBe('CARD');
    const proposal = (turn.pending.card as any).proposal;
    expect(proposal.currency).toBe('EUR');
    expect(proposal.bankAccount.currency).toBe('EUR');
    expect(proposal.lines[0]).toMatchObject({ quantity: '1.00', unit: 'item', rate: '600.00', amount: '600.00' });
  });

  // review-2026-10-12 R-06: SEVERAL_ACCOUNTS_IN_CURRENCY is a question the Freelancer can answer.
  it('AC-19: several EUR accounts ask which; the answer naming the account gets the card', async () => {
    const { profile, turn, call } = await setup();
    await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Wise', accountNumber: 'DE0000001234' });
    const revolut = await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Revolut' });
    const first = { customer: 'Acme', currency: 'EUR', lines: [{ description: 'logo design', price: '600' }] };

    const asked = await call(first);

    expect(asked.kind).toBe('ISSUES');
    expect(asked.issues.map((i: any) => i.kind)).toEqual(['SEVERAL_ACCOUNTS_IN_CURRENCY']);
    expect(turn.pending.card).toBeNull();

    const answered = await call({ ...first, bankAccount: 'Revolut' });

    expect(answered.kind).toBe('CARD');
    const proposal = (turn.pending.card as any).proposal;
    expect(proposal.bankAccount).toMatchObject({ bankAccountId: revolut.id, currency: 'EUR', source: 'REQUEST' });
  });

  it('the tool input takes every field spec.md §1 lets a request set (R-06, R-09)', async () => {
    const { tool } = await setup();
    const keys = Object.keys(tool.inputSchema._def.schema?.shape ?? tool.inputSchema.shape ?? {});
    for (const key of ['bankAccount', 'taxRate', 'discount', 'shipping', 'poNumber', 'paymentTerms', 'notes', 'terms']) {
      expect(keys).toContain(key);
    }
  });

  it('AC-20: two matching Customers come back as CUSTOMER_AMBIGUOUS naming both, with no card', async () => {
    const { user, turn, call } = await setup();
    await createCustomer(prisma, user.id, { name: 'Acme GmbH' });

    const out = await call(consulting);

    expect(out.kind).toBe('ISSUES');
    const issue = out.issues.find((i: any) => i.kind === 'CUSTOMER_AMBIGUOUS');
    expect(issue.candidates.map((c: any) => c.name.freelancerText).sort()).toEqual(['Acme Corp', 'Acme GmbH']);
    expect(turn.pending.card).toBeNull();
  });

  it('AC-21: an unknown Customer is CUSTOMER_NOT_FOUND with the new-customer link, no card', async () => {
    const { turn, call } = await setup();

    const out = await call({ customer: 'Globex', lines: [{ description: 'days', quantity: '3', price: '450' }] });

    expect(out.kind).toBe('ISSUES');
    expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'CUSTOMER_NOT_FOUND' })]));
    expect(out.links).toEqual(expect.arrayContaining([{ kind: 'page', page: 'new-customer' }]));
    expect(turn.pending.card).toBeNull();
  });

  it('AC-22: a line with no amount is LINE_AMOUNT_MISSING and fills in no value, no card', async () => {
    const { turn, call } = await setup();

    const out = await call({ customer: 'Acme', lines: [{ description: 'the website' }] });

    expect(out.kind).toBe('ISSUES');
    expect(out.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'LINE_AMOUNT_MISSING', lineIndex: 0 })])
    );
    expect(turn.pending.card).toBeNull();
  });

  it('a second call in one turn replaces the pending card (one card per message)', async () => {
    const { turn, call } = await setup();

    const first = await call(consulting);
    const second = await call({ customer: 'Acme', lines: [{ description: 'design', quantity: '1', price: '70' }] });

    expect(second.cardId).not.toBe(first.cardId);
    const card = turn.pending.card as any;
    expect(card.id).toBe(second.cardId);
    expect(card.proposal.total).toBe('70.00');
  });

  it('an incomplete call after a card keeps the earlier pending card', async () => {
    const { turn, call } = await setup();

    const first = await call(consulting);
    await call({ customer: 'Globex', lines: [{ description: 'x', quantity: '1', price: '1' }] });

    expect((turn.pending.card as any).id).toBe(first.cardId);
  });

  it('AC-15 / edge: an invented customerId of another Freelancer is CUSTOMER_NOT_FOUND', async () => {
    const { turn, call } = await setup();
    const other = await createFreelancer(prisma, { email: 't27-b@example.com', timeZone: TZ });
    const theirs = await createCustomer(prisma, other.id, { name: 'Acme Corp' });

    const out = await call({ customerId: theirs.id, lines: [{ description: 'x', quantity: '1', price: '1' }] });

    expect(out.kind).toBe('ISSUES');
    expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'CUSTOMER_NOT_FOUND' })]));
    expect(turn.pending.card).toBeNull();
  });

  it('takes only the strict DraftRequest: no actor field, unknown keys rejected, customer xor customerId', async () => {
    const { tool } = await setup();
    const keys = Object.keys(tool.inputSchema.shape ?? {});
    for (const forbidden of ['actorId', 'userId', 'freelancerId', 'ownerId']) expect(keys).not.toContain(forbidden);
    expect(tool.inputSchema.safeParse({ ...consulting, userId: 'x' }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ lines: consulting.lines }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ ...consulting, customerId: 'c1' }).success).toBe(false);
    expect(tool.inputSchema.safeParse(consulting).success).toBe(true);
  });

  it('its description carries the data-not-instructions suffix', async () => {
    const { tool } = await setup();
    const { DATA_NOT_INSTRUCTIONS } = await import('@/lib/mcp/server');
    expect(tool.description).toContain(DATA_NOT_INSTRUCTIONS);
  });
});
