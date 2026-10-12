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
      const { profile, usd } = await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: '£' }));

      expect(issues).toEqual([
        {
          kind: 'NO_ACCOUNT_IN_CURRENCY',
          currency: 'GBP',
          senderProfileId: profile.id,
          // fix 2026-10-12: the accounts the profile does have, with their currencies, so the chat can say so.
          accounts: [{ bankAccountId: usd.id, label: expect.any(String), currency: 'USD' }],
          otherProfiles: [],
        },
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
      const { profile, usd } = await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const b = await createFreelancer(prisma, { email: 't07-b@example.com' });
      const bp = await createSenderProfile(prisma, b.id, { name: 'B' });
      await createBankAccount(prisma, bp.id, { currency: 'EUR' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'EUR' }));

      expect(issues).toEqual([
        {
          kind: 'NO_ACCOUNT_IN_CURRENCY',
          currency: 'EUR',
          senderProfileId: profile.id,
          // fix 2026-10-12: the accounts the profile does have, with their currencies, so the chat can say so.
          accounts: [{ bankAccountId: usd.id, label: expect.any(String), currency: 'USD' }],
          otherProfiles: [],
        },
      ]);
    });

    // fix 2026-10-12: the owner's default profile has only a EUR account and another profile, "Dmytro Hopko", has a
    // USD one. The answer names that profile so the chat can offer it (AC-17 "offers to draft under another
    // profile if the Freelancer names it"); it is never picked.
    it('fix 2026-10-12: no account in the currency names the other sender profiles that have one, picks none', async () => {
      const { user, actor } = await freelancer();
      const main = await createSenderProfile(prisma, user.id, { name: 'Dima Gopko' });
      await createBankAccount(prisma, main.id, { currency: 'EUR', bankName: 'Privat' });
      const other = await createSenderProfile(prisma, user.id, { name: 'Dmytro Hopko', isDefault: false });
      await createBankAccount(prisma, other.id, { currency: 'USD', bankName: 'Mono' });
      const third = await createSenderProfile(prisma, user.id, { name: 'Side', isDefault: false });
      await createBankAccount(prisma, third.id, { currency: 'PLN' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'USD' }));

      expect(issues).toEqual([
        expect.objectContaining({
          kind: 'NO_ACCOUNT_IN_CURRENCY',
          currency: 'USD',
          senderProfileId: main.id,
          otherProfiles: [{ senderProfileId: other.id, name: { freelancerText: 'Dmytro Hopko' } }],
        }),
      ]);
    });

    it.each([
      ['dollars', 'USD'],
      ['доларів', 'USD'],
      ['euro', 'EUR'],
      ['євро', 'EUR'],
      ['гривень', 'UAH'],
      ['pounds', 'GBP'],
    ])('review R6-4: the currency word "%s" reads as %s, like its symbol', async (word, code) => {
      const { user, actor } = await freelancer();
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: code as 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const p = await okParties(resolve(actor, { customer: 'Acme', currency: word }));

      expect(p.currency).toBe(code);
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

  // review-2026-10-12 R-08: the default due date counts from the issue date the request named.
  it('a named issue date without a due date: due 30 days after that issue date (DEFAULT)', async () => {
    const { user, actor } = await freelancer();
    await usdProfile(user.id);
    await createCustomer(prisma, user.id, { name: 'Acme Corp' });

    const p = await okParties(resolve(actor, { customer: 'Acme', issueDate: '2026-05-01' }));

    expect(p.issueDate).toEqual({ value: '2026-05-01', source: 'REQUEST' });
    expect(p.dueDate).toEqual({ value: '2026-05-31', source: 'DEFAULT' });
  });

  // review-2026-10-12 R-06 (AC-19): the request may name the bank account, matched within the profile.
  describe('AC-19 a named bank account', () => {
    async function twoEur(userId: string) {
      const { profile, usd } = await usdProfile(userId);
      const wise = await createBankAccount(prisma, profile.id, {
        currency: 'EUR',
        bankName: 'Wise',
        accountNumber: 'DE0000001234',
      });
      const revolut = await createBankAccount(prisma, profile.id, {
        currency: 'EUR',
        bankName: 'Revolut',
        accountNumber: 'LT0000005678',
      });
      await createCustomer(prisma, userId, { name: 'Acme Corp' });
      return { profile, usd, wise, revolut };
    }

    it('several EUR accounts and the request names one ("wise"): that account, source REQUEST', async () => {
      const { user, actor } = await freelancer();
      const { wise } = await twoEur(user.id);

      const p = await okParties(resolve(actor, { customer: 'Acme', currency: 'EUR', bankAccount: 'wise' }));

      expect(p.bankAccount).toMatchObject({ bankAccountId: wise.id, currency: 'EUR', source: 'REQUEST' });
      expect(p.bankAccount.label).toBe('Wise ••1234');
      expect(p.currency).toBe('EUR');
    });

    it('the account named by its last four digits, or by its id', async () => {
      const { user, actor } = await freelancer();
      const { revolut, wise } = await twoEur(user.id);

      const byDigits = await okParties(resolve(actor, { customer: 'Acme', currency: 'EUR', bankAccount: '5678' }));
      const byId = await okParties(resolve(actor, { customer: 'Acme', bankAccount: wise.id }));

      expect(byDigits.bankAccount.bankAccountId).toBe(revolut.id);
      expect(byId.bankAccount).toMatchObject({ bankAccountId: wise.id, source: 'REQUEST' });
    });

    it('a named account without a currency sets the currency (an invoice and its account share one)', async () => {
      const { user, actor } = await freelancer();
      const { revolut } = await twoEur(user.id);

      const p = await okParties(resolve(actor, { customer: 'Acme', bankAccount: 'Revolut' }));

      expect(p.bankAccount).toMatchObject({ bankAccountId: revolut.id, source: 'REQUEST' });
      expect(p.currency).toBe('EUR');
    });

    it('a name that matches no account of the profile: BANK_ACCOUNT_NOT_FOUND naming the choices', async () => {
      const { user, actor } = await freelancer();
      const { wise, revolut } = await twoEur(user.id);

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'EUR', bankAccount: 'Monzo' }));

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'BANK_ACCOUNT_NOT_FOUND', written: 'Monzo' });
      const accounts = issues[0].accounts as { bankAccountId: string }[];
      expect(accounts.map((a) => a.bankAccountId).sort()).toEqual([wise.id, revolut.id].sort());
    });

    it('an account in another currency than the one named is not used: BANK_ACCOUNT_CURRENCY_MISMATCH names its currency', async () => {
      const { user, actor } = await freelancer();
      const { wise } = await twoEur(user.id);

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'USD', bankAccount: 'Wise' }));

      expect(issues).toEqual([
        {
          kind: 'BANK_ACCOUNT_CURRENCY_MISMATCH',
          written: 'Wise',
          currency: 'USD',
          senderProfileId: expect.any(String),
          account: { bankAccountId: wise.id, label: expect.stringContaining('Wise'), currency: 'EUR' },
        },
      ]);
    });

    it('fix 2026-10-12: a named account in another currency when the profile has none in the asked one is still a mismatch, not NO_ACCOUNT_IN_CURRENCY', async () => {
      const { user, actor } = await freelancer();
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      const privat = await createBankAccount(prisma, profile.id, { currency: 'UAH', bankName: 'Privat' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      // AC-19b's own words: "1660 dollars" (review R6-4), passed as the Freelancer wrote them.
      const issues = await issuesOf(resolve(actor, { customer: 'Acme', currency: 'dollars', bankAccount: 'Privat' }));

      expect(issues).toEqual([
        {
          kind: 'BANK_ACCOUNT_CURRENCY_MISMATCH',
          written: 'Privat',
          currency: 'USD',
          senderProfileId: profile.id,
          account: { bankAccountId: privat.id, label: expect.stringContaining('Privat'), currency: 'UAH' },
        },
      ]);
    });

    it('review R6-3: an exact name in another currency does not hide an in-currency account that contains the name', async () => {
      const { user, actor } = await freelancer();
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'UAH', bankName: 'Privat' });
      const privatUsd = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'PrivatBank' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const p = await okParties(resolve(actor, { customer: 'Acme', currency: 'USD', bankAccount: 'Privat' }));

      expect(p.bankAccount.bankAccountId).toBe(privatUsd.id);
    });

    it('a name matching several accounts: BANK_ACCOUNT_AMBIGUOUS, never a pick', async () => {
      const { user, actor } = await freelancer();
      const { profile } = await usdProfile(user.id);
      const a = await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Wise', accountNumber: '1111' });
      const b = await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Wise', accountNumber: '2222' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', bankAccount: 'wise' }));

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'BANK_ACCOUNT_AMBIGUOUS', written: 'wise' });
      const accounts = issues[0].accounts as { bankAccountId: string }[];
      expect(accounts.map((x) => x.bankAccountId).sort()).toEqual([a.id, b.id].sort());
    });

    it("another profile's account is not matched", async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const other = await createSenderProfile(prisma, user.id, { name: 'Studio' });
      await createBankAccount(prisma, other.id, { currency: 'EUR', bankName: 'Wise' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const issues = await issuesOf(resolve(actor, { customer: 'Acme', bankAccount: 'Wise' }));

      expect(issues.map((i) => i.kind)).toEqual(['BANK_ACCOUNT_NOT_FOUND']);
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

  // fix 2026-10-12 (spec.md §1 "Matching names", AC-20, AC-21): the owner's Customer is stored as "Оohn Doe "
  // with a Cyrillic "О" and a trailing space; the model writes "Oohn Doe" in Latin letters. Look-alike letters
  // and stray spaces are folded on both sides for the comparison only; the stored name is shown as it is.
  describe('fix 2026-10-12: names match across look-alike letters and stray spaces', () => {
    const STORED = '\u041eohn Doe '; // "Оohn Doe " - Cyrillic capital O, trailing space

    it('the Latin "Oohn Doe" finds the Customer stored as "Оohn Doe ", showing the stored name', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const owner = await createCustomer(prisma, user.id, { name: STORED });

      const p = await okParties(resolve(actor, { customer: 'Oohn  Doe' }));

      expect(p.customer.customerId).toBe(owner.id);
      expect(p.customer.name.freelancerText).toBe(STORED);
    });

    it('"John Doe" is a near miss of "Оohn Doe ": offered as a question, never filled in', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      const owner = await createCustomer(prisma, user.id, { name: STORED });

      const issues = await issuesOf(resolve(actor, { customer: 'John Doe' }));

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'CUSTOMER_NEAR_MISS', written: 'John Doe' });
      expect((issues[0].candidates as { customerId: string }[]).map((c) => c.customerId)).toEqual([owner.id]);
    });

    it('a sender profile and a bank account written with look-alike letters are found', async () => {
      const { user, actor } = await freelancer();
      await usdProfile(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const studio = await createSenderProfile(prisma, user.id, { name: 'Dmytro Hopko ' });
      const privat = await createBankAccount(prisma, studio.id, { currency: 'USD', bankName: '\u0420rivat' }); // Cyrillic "Р"

      const p = await okParties(resolve(actor, { customer: 'Acme', senderProfile: 'Dmytrо Hopko', bankAccount: 'Privat' })); // Cyrillic "о"

      expect(p.senderProfile).toMatchObject({ senderProfileId: studio.id, source: 'REQUEST' });
      expect(p.bankAccount).toMatchObject({ bankAccountId: privat.id, source: 'REQUEST' });
    });
  });

  it('several issues at once are all returned, in request order (customer, then currency)', async () => {
    const { user, actor } = await freelancer();
    await usdProfile(user.id);

    const issues = await issuesOf(resolve(actor, { customer: 'Globex', currency: 'GBP' }));

    expect(issues.map((i) => i.kind)).toEqual(['CUSTOMER_NOT_FOUND', 'NO_ACCOUNT_IN_CURRENCY']);
  });
});
