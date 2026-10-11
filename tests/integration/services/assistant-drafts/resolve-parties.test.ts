// T07 (ai-assistant; spec.md §5 AC-17, AC-19, AC-20, AC-21) - resolveParties never picks a value the
// Freelancer did not give: it returns the named DraftIssue or a party block whose every value has
// source REQUEST or DEFAULT, reading only the acting Freelancer's rows.
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

type Issue = { kind: string; [k: string]: unknown };
type Parties = {
  customer: { customerId: string; name: { freelancerText: string }; source: string };
  senderProfile: { senderProfileId: string; name: { freelancerText: string }; source: string };
  bankAccount: { bankAccountId: string; label: string; currency: string; source: string };
  currency: string;
  issueDate: { value: string; source: string };
  dueDate: { value: string; source: string };
};
type Result = { ok: true; parties: Parties } | { ok: false; issues: Issue[] };
type Svc = {
  resolveParties: (actor: unknown, request: unknown, today: string) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('resolveParties (T07)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/resolve-parties')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  const line = [{ description: 'Logo design', price: '600' }];

  async function freelancer(email = 't07-a@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    return { user, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  async function resolve(actor: unknown, request: Record<string, unknown>) {
    return svc.resolveParties(actor, { lines: line, ...request }, TODAY);
  }

  async function okParties(r: Promise<Result>): Promise<Parties> {
    const res = await r;
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(JSON.stringify(res.issues));
    return res.parties;
  }

  async function issuesOf(r: Promise<Result>): Promise<Issue[]> {
    const res = await r;
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected issues');
    return res.issues;
  }

  async function usdProfile(userId: string) {
    const profile = await createSenderProfile(prisma, userId, { name: 'Main' });
    const usd = await createBankAccount(prisma, profile.id, { currency: 'USD' });
    return { profile, usd };
  }

  it('defaults: default profile, its default account, currency, today and +30 days (all DEFAULT)', async () => {
    const { user, actor } = await freelancer();
    const { profile, usd } = await usdProfile(user.id);
    const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp' });

    const p = await okParties(resolve(actor, { customer: 'acme' }));

    expect(p.customer).toMatchObject({ customerId: acme.id, source: 'REQUEST' });
    expect(p.customer.name.freelancerText).toBe('Acme Corp');
    expect(p.senderProfile).toMatchObject({ senderProfileId: profile.id, source: 'DEFAULT' });
    expect(p.bankAccount).toMatchObject({ bankAccountId: usd.id, currency: 'USD', source: 'DEFAULT' });
    expect(p.currency).toBe('USD');
    expect(p.issueDate).toEqual({ value: '2026-03-15', source: 'DEFAULT' });
    expect(p.dueDate).toEqual({ value: '2026-04-14', source: 'DEFAULT' });
  });

  it('request dates win and are marked REQUEST; a named sender profile is REQUEST', async () => {
    const { user, actor } = await freelancer();
    await usdProfile(user.id);
    const other = await createSenderProfile(prisma, user.id, { name: 'Studio' });
    const acct = await createBankAccount(prisma, other.id, { currency: 'USD' });
    await createCustomer(prisma, user.id, { name: 'Acme Corp' });

    const p = await okParties(
      resolve(actor, {
        customer: 'Acme',
        senderProfile: 'studio',
        issueDate: '2026-02-01',
        dueDate: '2026-02-10',
      })
    );

    expect(p.senderProfile).toMatchObject({ senderProfileId: other.id, source: 'REQUEST' });
    expect(p.bankAccount.bankAccountId).toBe(acct.id);
    expect(p.issueDate).toEqual({ value: '2026-02-01', source: 'REQUEST' });
    expect(p.dueDate).toEqual({ value: '2026-02-10', source: 'REQUEST' });
  });

  it('a named sender profile that does not exist is SENDER_PROFILE_NOT_FOUND', async () => {
    const { user, actor } = await freelancer();
    await usdProfile(user.id);
    await createCustomer(prisma, user.id, { name: 'Acme Corp' });

    const issues = await issuesOf(resolve(actor, { customer: 'Acme', senderProfile: 'Nowhere' }));

    expect(issues).toEqual([
      expect.objectContaining({ kind: 'SENDER_PROFILE_NOT_FOUND', written: 'Nowhere' }),
    ]);
  });

  describe('AC-17 no sender profile with a bank account', () => {
    it('no sender profile at all', async () => {
      const { user, actor } = await freelancer();
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme' }));

      expect(issues.map((i) => i.kind)).toEqual(['NO_SENDER_PROFILE_WITH_ACCOUNT']);
    });

    it('profiles exist but none has an account', async () => {
      const { user, actor } = await freelancer();
      await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createSenderProfile(prisma, user.id, { name: 'Studio' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme' }));

      expect(issues.map((i) => i.kind)).toEqual(['NO_SENDER_PROFILE_WITH_ACCOUNT']);
    });

    it('default profile without account, another with one: names the others, never picks', async () => {
      const { user, actor } = await freelancer();
      const def = await createSenderProfile(prisma, user.id, { name: 'Main' });
      const other = await createSenderProfile(prisma, user.id, { name: 'Studio' });
      await createBankAccount(prisma, other.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const res = await svc.resolveParties(actor, { customer: 'Acme', lines: line }, TODAY);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.issues).toEqual([
        {
          kind: 'DEFAULT_PROFILE_WITHOUT_ACCOUNT',
          defaultSenderProfileId: def.id,
          otherProfiles: [{ senderProfileId: other.id, name: { freelancerText: 'Studio' } }],
        },
      ]);
    });

    it('other Freelancers\' profiles and accounts do not count', async () => {
      const { user, actor } = await freelancer();
      await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const b = await createFreelancer(prisma, { email: 't07-b@example.com' });
      await usdProfile(b.id);

      const issues = await issuesOf(resolve(actor, { customer: 'Acme' }));

      expect(issues.map((i) => i.kind)).toEqual(['NO_SENDER_PROFILE_WITH_ACCOUNT']);
    });
  });

  describe('AC-19 currency picks the bank account', () => {
    it('EUR named, default USD, one EUR account: that account, source REQUEST', async () => {
      const { user, actor } = await freelancer();
      const { profile } = await usdProfile(user.id);
      const eur = await createBankAccount(prisma, profile.id, { currency: 'EUR' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const p = await okParties(resolve(actor, { customer: 'Acme', currency: 'EUR' }));

      expect(p.bankAccount).toMatchObject({ bankAccountId: eur.id, currency: 'EUR', source: 'REQUEST' });
      expect(p.currency).toBe('EUR');
    });

    it('"€" means EUR', async () => {
      const { user, actor } = await freelancer();
      const { profile } = await usdProfile(user.id);
      const eur = await createBankAccount(prisma, profile.id, { currency: 'EUR' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const p = await okParties(resolve(actor, { customer: 'Acme', currency: '€' }));

      expect(p.bankAccount.bankAccountId).toBe(eur.id);
    });

    it('"£" means GBP: no GBP account gives NO_ACCOUNT_IN_CURRENCY, never a USD card', async () => {
      const { user, actor } = await freelancer();
      const { profile } = await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: '£' }));

      expect(issues).toEqual([
        { kind: 'NO_ACCOUNT_IN_CURRENCY', currency: 'GBP', senderProfileId: profile.id },
      ]);
    });

    it('several EUR accounts in the default profile: SEVERAL_ACCOUNTS_IN_CURRENCY naming them', async () => {
      const { user, actor } = await freelancer();
      const { profile } = await usdProfile(user.id);
      const e1 = await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Bank One' });
      const e2 = await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Bank Two' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'EUR' }));

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'SEVERAL_ACCOUNTS_IN_CURRENCY', currency: 'EUR' });
      const accounts = issues[0].accounts as { bankAccountId: string }[];
      expect(accounts.map((a) => a.bankAccountId).sort()).toEqual([e1.id, e2.id].sort());
    });

    it('a EUR account in another Freelancer\'s profile is not used', async () => {
      const { user, actor } = await freelancer();
      const { profile } = await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const b = await createFreelancer(prisma, { email: 't07-b@example.com' });
      const bp = await createSenderProfile(prisma, b.id, { name: 'B' });
      await createBankAccount(prisma, bp.id, { currency: 'EUR' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'EUR' }));

      expect(issues).toEqual([
        { kind: 'NO_ACCOUNT_IN_CURRENCY', currency: 'EUR', senderProfileId: profile.id },
      ]);
    });

    it('an unreadable currency word is CURRENCY_UNCLEAR', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'bucks' }));

      expect(issues).toEqual([expect.objectContaining({ kind: 'CURRENCY_UNCLEAR', written: 'bucks' })]);
    });

    it('"$" with a USD default account is USD, source DEFAULT', async () => {
      const { user, actor } = await freelancer();
      const { usd } = await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const p = await okParties(resolve(actor, { customer: 'Acme', currency: '$' }));

      expect(p.currency).toBe('USD');
      expect(p.bankAccount.bankAccountId).toBe(usd.id);
    });
  });

  describe('AC-20 several Customers', () => {
    it('"Acme" matches Acme Corp and Acme GmbH: asks which, naming both, picks none', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const corp = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const gmbh = await createCustomer(prisma, user.id, { name: 'Acme GmbH' });
      await createCustomer(prisma, user.id, { name: 'Initech' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme' }));

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'CUSTOMER_AMBIGUOUS', written: 'Acme' });
      const candidates = issues[0].candidates as { customerId: string; name: { freelancerText: string } }[];
      expect(candidates.map((c) => c.customerId).sort()).toEqual([corp.id, gmbh.id].sort());
      expect(candidates.map((c) => c.name.freelancerText).sort()).toEqual(['Acme Corp', 'Acme GmbH']);
    });

    it('matching ignores case', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const corp = await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const p = await okParties(resolve(actor, { customer: 'aCmE cOrP' }));

      expect(p.customer.customerId).toBe(corp.id);
    });

    it('another Freelancer\'s Customers are not candidates', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const mine = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const b = await createFreelancer(prisma, { email: 't07-b@example.com' });
      await createCustomer(prisma, b.id, { name: 'Acme GmbH' });

      const p = await okParties(resolve(actor, { customer: 'Acme' }));

      expect(p.customer.customerId).toBe(mine.id);
    });
  });

  describe('AC-21 no matching Customer', () => {
    it('"Globex": CUSTOMER_NOT_FOUND, no Customer created', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const before = await prisma.customer.count();

      const issues = await issuesOf(resolve(actor, { customer: 'Globex' }));

      expect(issues).toEqual([{ kind: 'CUSTOMER_NOT_FOUND', written: 'Globex' }]);
      expect(await prisma.customer.count()).toBe(before);
    });

    it('a typo is offered as CUSTOMER_NEAR_MISS and never filled in', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const corp = await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acmee Corp' }));

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'CUSTOMER_NEAR_MISS', written: 'Acmee Corp' });
      expect((issues[0].candidates as { customerId: string }[]).map((c) => c.customerId)).toEqual([corp.id]);
    });

    it('a customerId of another Freelancer is CUSTOMER_NOT_FOUND, like an unknown id', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const b = await createFreelancer(prisma, { email: 't07-b@example.com' });
      const foreign = await createCustomer(prisma, b.id, { name: 'Acme Corp' });

      const foreignIssues = await issuesOf(resolve(actor, { customerId: foreign.id }));
      const unknownIssues = await issuesOf(resolve(actor, { customerId: 'does-not-exist' }));

      expect(foreignIssues.map((i) => i.kind)).toEqual(['CUSTOMER_NOT_FOUND']);
      expect(unknownIssues.map((i) => i.kind)).toEqual(['CUSTOMER_NOT_FOUND']);
    });

    it('an own customerId resolves with source REQUEST', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const own = await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const p = await okParties(resolve(actor, { customerId: own.id }));

      expect(p.customer).toMatchObject({ customerId: own.id, source: 'REQUEST' });
    });
  });

  it('several issues at once are all returned, in request order (customer, then currency)', async () => {
    const { user, actor } = await freelancer();
    await usdProfile(user.id);

    const issues = await issuesOf(resolve(actor, { customer: 'Globex', currency: 'GBP' }));

    expect(issues.map((i) => i.kind)).toEqual(['CUSTOMER_NOT_FOUND', 'NO_ACCOUNT_IN_CURRENCY']);
  });
});
