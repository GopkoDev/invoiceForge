// ai-chat-v2 T09 (AC-05b; contracts/openapi.yaml DraftIssueDelta): a draft naming the Freelancer's own sender
// profile as the Customer gets CUSTOMER_NOT_FOUND carrying ownSenderProfile, no card, no link to add a Customer
// and no Offered choice. The hint is set only on a folded-equal name, only on not found, and only from the
// acting Freelancer's own profiles.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createCustomer } from '../support/factories/customer';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createBankAccount } from '../support/factories/bank-account';
import { actingFreelancerForTest } from '../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';
const LINE = { description: 'consulting', quantity: '10', unit: 'hours', price: '40' };

type Issue = { kind: string; [k: string]: any };
type Outcome =
  | { success: true; data: { kind: 'PROPOSAL'; proposal: any } | { kind: 'ISSUES'; issues: Issue[] } }
  | { success: false; code: string; message?: string };
type Svc = { resolveDraftRequest: (actor: unknown, request: unknown, today: string) => Promise<Outcome> };

describe.runIf(containerRuntimeAvailable)('own sender profile named as the Customer (ai-chat-v2 T09)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/resolve')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  // The Freelancer's only sender profile is "Consulting FOP"; they have a Customer "Acme Corp".
  async function setup() {
    const user = await createFreelancer(prisma, { email: 't09-a@example.com', timeZone: TZ });
    const fop = await createSenderProfile(prisma, user.id, { name: 'Consulting FOP' });
    await createBankAccount(prisma, fop.id, { currency: 'USD' });
    await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    return { user, fop, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  const resolve = (actor: unknown, customer: string) =>
    svc.resolveDraftRequest(actor, { customer, lines: [LINE], currency: 'USD' }, TODAY);

  async function issuesOf(p: Promise<Outcome>): Promise<Issue[]> {
    const res = await p;
    if (!res.success) throw new Error(`failure ${res.code}`);
    if (res.data.kind !== 'ISSUES') throw new Error(`expected issues, got ${JSON.stringify(res.data)}`);
    return res.data.issues;
  }

  it('"Consulting FOP" with no such Customer: CUSTOMER_NOT_FOUND carrying the own profile', async () => {
    const { actor, fop } = await setup();

    const issues = await issuesOf(resolve(actor, 'Consulting FOP'));

    const nf = issues.find((i) => i.kind === 'CUSTOMER_NOT_FOUND');
    expect(nf).toMatchObject({
      written: 'Consulting FOP',
      ownSenderProfile: { senderProfileId: fop.id, name: { freelancerText: 'Consulting FOP' } },
    });
  });

  it('"consulting  fop" (case and spaces) still sets the hint, with the profile\'s saved name', async () => {
    const { actor, fop } = await setup();

    const issues = await issuesOf(resolve(actor, 'consulting  fop'));

    expect(issues.find((i) => i.kind === 'CUSTOMER_NOT_FOUND')).toMatchObject({
      ownSenderProfile: { senderProfileId: fop.id, name: { freelancerText: 'Consulting FOP' } },
    });
  });

  it('a partial "Consulting" sets no hint', async () => {
    const { actor } = await setup();

    const issues = await issuesOf(resolve(actor, 'Consulting'));

    const nf = issues.find((i) => i.kind === 'CUSTOMER_NOT_FOUND');
    expect(nf).toBeDefined();
    expect(nf).not.toHaveProperty('ownSenderProfile');
  });

  it('a Customer also named "Consulting FOP" resolves to that Customer, no hint', async () => {
    const { user, actor } = await setup();
    const customer = await createCustomer(prisma, user.id, { name: 'Consulting FOP' });

    const res = await resolve(actor, 'Consulting FOP');

    expect(res.success && res.data.kind).toBe('PROPOSAL');
    if (res.success && res.data.kind === 'PROPOSAL') {
      expect(res.data.proposal.customer.customerId).toBe(customer.id);
    }
  });

  it('a customerId that is not found sets no hint', async () => {
    const { actor } = await setup();

    const res = await svc.resolveDraftRequest(actor, { customerId: 'does-not-exist', lines: [LINE], currency: 'USD' }, TODAY);
    if (!res.success || res.data.kind !== 'ISSUES') throw new Error('expected issues');

    const nf = res.data.issues.find((i) => i.kind === 'CUSTOMER_NOT_FOUND');
    expect(nf).toBeDefined();
    expect(nf).not.toHaveProperty('ownSenderProfile');
  });

  it('another Freelancer\'s sender profile of that name gives no hint (owner-scoped)', async () => {
    const { actor } = await setup();
    const other = await createFreelancer(prisma, { email: 't09-b@example.com', timeZone: TZ });
    await createSenderProfile(prisma, other.id, { name: 'Acme Studio' });

    const issues = await issuesOf(resolve(actor, 'Acme Studio'));

    const nf = issues.find((i) => i.kind === 'CUSTOMER_NOT_FOUND');
    expect(nf).toBeDefined();
    expect(nf).not.toHaveProperty('ownSenderProfile');
  });

  it('scripted propose_draft: ISSUES with the hint, no card, no add-Customer link, no offer row', async () => {
    const { actor } = await setup();
    const { createTurnContext } = await import('@/lib/ai/turn-context');
    const { createProposeDraftTool } = await import('@/lib/ai/tools/propose-draft');
    const turn = createTurnContext({ actor, today: TODAY, draftIntent: true });
    const tool = createProposeDraftTool(turn) as { execute?: (i: any, c: any) => Promise<any> };

    const out = await tool.execute!({ customer: 'Consulting FOP', lines: [LINE], currency: 'USD' }, {});

    expect(out.kind).toBe('ISSUES');
    expect(out.issues.find((i: Issue) => i.kind === 'CUSTOMER_NOT_FOUND')).toHaveProperty('ownSenderProfile');
    expect(turn.pending.card).toBeNull(); // the turn starts with no card (turn-context)
    expect(out.links).not.toContainEqual({ kind: 'page', page: 'new-customer' });
    expect(await prisma.choiceOffer.count()).toBe(0);
  });
});
