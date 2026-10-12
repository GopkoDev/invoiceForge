// T07 (ai-assistant; spec.md §5 AC-17, AC-19, AC-20, AC-21): resolves the Customer, sender profile,
// bank account, currency and dates of a draft request. It never picks a value the Freelancer did not
// give: it returns the named DraftIssue, or a party block whose every value is REQUEST or DEFAULT.
import 'server-only';
import { prisma } from '@/prisma';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { newInvoiceDefaults } from '@/lib/services/invoices/editor-data';
import { bankAccountSelect } from '@/lib/services/invoices/select-queries';
import { addDaysToDay, utcDateToDay } from '@/lib/helpers/calendar-day';
import { interpretCurrency } from '@/lib/services/assistant-drafts/currency-symbols';
import { foldName } from '@/lib/helpers/fold-name';
import { accountLastFour } from '@/lib/helpers/account-last-four';
import type { DraftIssue, DraftProposal, DraftRequest } from '@/lib/services/assistant-drafts/schema';

export type ResolvedParties = Pick<
  DraftProposal,
  'customer' | 'senderProfile' | 'bankAccount' | 'currency' | 'issueDate' | 'dueDate'
>;

export type ResolvePartiesResult =
  | { ok: true; parties: ResolvedParties }
  | { ok: false; issues: DraftIssue[] };

type Currency = DraftProposal['currency'];
type Account = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: Currency;
  isDefault: boolean;
  senderProfileId: string;
};
type Profile = { id: string; name: string; isDefault: boolean; bankAccounts: Account[] };
type CustomerRow = { id: string; name: string; email: string | null };

// The contract's label: the bank name and the last four of the account number.
const accountLabel = (a: Account) => `${a.bankName} ••${a.accountNumber.slice(-4)}`;
// ai-chat-v2 (DraftIssueDelta): the email tells look-alike names apart on an Offered choice (AC-10).
const candidatesOf = (rows: CustomerRow[]) =>
  rows.map((c) => ({ customerId: c.id, name: { freelancerText: c.name }, email: c.email }));

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return true;
  const restA = a.slice(i);
  const restB = b.slice(i);
  if (a.length === b.length) return restA.slice(1) === restB.slice(1);
  return a.length > b.length ? restA.slice(1) === restB : restB.slice(1) === restA;
}

async function resolveCustomer(
  actor: ActingFreelancer,
  request: DraftRequest,
): Promise<{ customer: ResolvedParties['customer'] } | { issue: DraftIssue }> {
  const found = (c: CustomerRow) => ({
    customer: { customerId: c.id, name: { freelancerText: c.name }, source: 'REQUEST' as const },
  });
  if (request.customerId !== undefined) {
    const row = await prisma.customer.findFirst({
      where: { id: request.customerId, userId: actor.userId },
      select: { id: true, name: true, email: true },
    });
    return row ? found(row) : { issue: { kind: 'CUSTOMER_NOT_FOUND', written: request.customerId } };
  }
  const written = request.customer ?? '';
  const needle = foldName(written);
  const rows = await prisma.customer.findMany({
    where: { userId: actor.userId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  const matches = rows.filter((c) => foldName(c.name).includes(needle));
  const exact = matches.filter((c) => foldName(c.name) === needle);
  if (exact.length === 1) return found(exact[0]);
  if (matches.length === 1) return found(matches[0]);
  if (matches.length > 1) {
    return { issue: { kind: 'CUSTOMER_AMBIGUOUS', written, candidates: candidatesOf(matches) } };
  }
  const near = rows.filter((c) => withinOneEdit(foldName(c.name), needle));
  if (near.length > 0) {
    return { issue: { kind: 'CUSTOMER_NEAR_MISS', written, candidates: candidatesOf(near) } };
  }
  return { issue: { kind: 'CUSTOMER_NOT_FOUND', written } };
}

const accountWithCurrency = (a: Account) => ({ bankAccountId: a.id, label: accountLabel(a), currency: a.currency });
// ai-chat-v2 (DraftIssueDelta BankAccountCandidate): bank name, last four and currency for the choice label.
const accountOption = (a: Account) => ({
  ...accountWithCurrency(a),
  bankName: { freelancerText: a.bankName },
  lastFour: accountLastFour(a.accountNumber),
});
const profileRefs = (profiles: Profile[]) =>
  profiles.map((p) => ({ senderProfileId: p.id, name: { freelancerText: p.name } }));

/**
 * AC-19 (review-2026-10-12 R-06): the bank account the request names, matched within the chosen
 * profile (and currency) like a name (spec.md §1 "Matching names"): its id, or words contained in
 * its bank name, account name or account number. One exact name wins; several → asked; none → told.
 */
function matchAccount(written: string, accounts: Account[]): { account: Account } | { issue: DraftIssue } {
  const byId = accounts.find((a) => a.id === written);
  if (byId) return { account: byId };
  const needle = foldName(written);
  const matches = accounts.filter((a) =>
    [a.bankName, a.accountName, a.accountNumber, accountLabel(a)].some((t) => foldName(t).includes(needle))
  );
  if (matches.length === 1) return { account: matches[0] };
  const exact = matches.filter((a) => foldName(a.bankName) === needle || foldName(accountLabel(a)) === needle);
  if (exact.length === 1) return { account: exact[0] };
  if (matches.length > 1) {
    return { issue: { kind: 'BANK_ACCOUNT_AMBIGUOUS', written, accounts: matches.map(accountOption) } };
  }
  return { issue: { kind: 'BANK_ACCOUNT_NOT_FOUND', written, accounts: accounts.map(accountOption) } };
}

type Chosen = {
  senderProfile: ResolvedParties['senderProfile'];
  bankAccount: ResolvedParties['bankAccount'];
  currency: Currency;
};

function resolveSenderAndAccount(
  request: DraftRequest,
  profiles: Profile[],
  defaults: { senderProfileId: string; bankAccountId: string },
): { chosen: Chosen } | { issue: DraftIssue } {
  let profile: Profile | undefined;
  let profileSource: 'REQUEST' | 'DEFAULT' = 'DEFAULT';
  if (request.senderProfileId !== undefined) {
    // Owner-scoped: another Freelancer's id is answered as a name that matches nothing (AC-07).
    profile = profiles.find((p) => p.id === request.senderProfileId);
    if (!profile) {
      return {
        issue: {
          kind: 'SENDER_PROFILE_NOT_FOUND',
          written: request.senderProfileId,
          options: profiles.map((p) => p.name),
          profiles: profileRefs(profiles),
        },
      };
    }
    profileSource = 'REQUEST';
  } else if (request.senderProfile !== undefined) {
    const needle = foldName(request.senderProfile);
    profile = profiles.find((p) => foldName(p.name) === needle);
    if (!profile) {
      const partial = profiles.filter((p) => foldName(p.name).includes(needle));
      if (partial.length === 1) profile = partial[0];
    }
    if (!profile) {
      return {
        issue: {
          kind: 'SENDER_PROFILE_NOT_FOUND',
          written: request.senderProfile,
          options: profiles.map((p) => p.name),
          profiles: profileRefs(profiles),
        },
      };
    }
    profileSource = 'REQUEST';
  } else {
    const withAccount = profiles.filter((p) => p.bankAccounts.length > 0);
    if (withAccount.length === 0) return { issue: { kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' } };
    profile = profiles.find((p) => p.id === defaults.senderProfileId);
    if (!profile || profile.bankAccounts.length === 0) {
      return {
        issue: {
          kind: 'DEFAULT_PROFILE_WITHOUT_ACCOUNT',
          defaultSenderProfileId: profile?.id ?? defaults.senderProfileId,
          otherProfiles: withAccount.map((p) => ({
            senderProfileId: p.id,
            name: { freelancerText: p.name },
          })),
        },
      };
    }
  }
  if (profile.bankAccounts.length === 0) return { issue: { kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' } };

  const defaultAccount =
    profile.bankAccounts.find((a) => a.id === defaults.bankAccountId) ??
    profile.bankAccounts.find((a) => a.isDefault) ??
    profile.bankAccounts[0];
  let currency: Currency | undefined;
  if (request.currency !== undefined) {
    const reading = interpretCurrency(request.currency, defaultAccount.currency);
    if (reading.kind === 'UNCLEAR') {
      return { issue: { kind: 'CURRENCY_UNCLEAR', written: request.currency, options: reading.options } };
    }
    currency = reading.currency as Currency;
  }
  const inCurrency = profile.bankAccounts.filter((a) => currency === undefined || a.currency === currency);
  if (currency !== undefined && request.bankAccount !== undefined) {
    // A named account that matches nothing in the asked currency but one account in another is never
    // used, and the answer says why (fix 2026-10-12; in-currency matches first, review R6-3).
    const inAsked = matchAccount(request.bankAccount, inCurrency);
    const elsewhere = 'issue' in inAsked && inAsked.issue.kind === 'BANK_ACCOUNT_NOT_FOUND'
      ? matchAccount(request.bankAccount, profile.bankAccounts)
      : null;
    if (elsewhere && 'account' in elsewhere) {
      return {
        issue: {
          kind: 'BANK_ACCOUNT_CURRENCY_MISMATCH',
          written: request.bankAccount,
          currency,
          senderProfileId: profile.id,
          account: accountWithCurrency(elsewhere.account),
        },
      };
    }
  }
  if (currency !== undefined && inCurrency.length === 0) {
    return {
      issue: {
        kind: 'NO_ACCOUNT_IN_CURRENCY',
        currency,
        senderProfileId: profile.id,
        accounts: profile.bankAccounts.map(accountWithCurrency),
        otherProfiles: profiles
          .filter((p) => p.id !== profile.id && p.bankAccounts.some((a) => a.currency === currency))
          .map((p) => ({ senderProfileId: p.id, name: { freelancerText: p.name } })),
      },
    };
  }

  let account = defaultAccount;
  let accountSource: 'REQUEST' | 'DEFAULT' = 'DEFAULT';
  if (request.bankAccount !== undefined) {
    const named = matchAccount(request.bankAccount, inCurrency);
    if ('issue' in named) return named;
    account = named.account;
    accountSource = 'REQUEST';
  } else if (currency !== undefined) {
    const preferred = inCurrency.find((a) => a.id === defaultAccount.id);
    if (profileSource === 'REQUEST' && inCurrency.length === 1) {
      // ai-chat-v2 AC-04: the named profile's only account in the named currency is taken from the request.
      account = inCurrency[0];
      accountSource = 'REQUEST';
    } else if (preferred) {
      account = preferred;
    } else if (inCurrency.length === 1) {
      account = inCurrency[0];
      accountSource = 'REQUEST';
    } else {
      return {
        issue: {
          kind: 'SEVERAL_ACCOUNTS_IN_CURRENCY',
          currency,
          accounts: inCurrency.map(accountOption),
        },
      };
    }
  }
  return {
    chosen: {
      senderProfile: {
        senderProfileId: profile.id,
        name: { freelancerText: profile.name },
        source: profileSource,
      },
      bankAccount: {
        bankAccountId: account.id,
        label: accountLabel(account),
        currency: account.currency,
        source: accountSource,
      },
      currency: account.currency,
    },
  };
}

export async function resolveParties(
  actor: ActingFreelancer,
  request: DraftRequest,
  today: string,
): Promise<ResolvePartiesResult> {
  const [customerResult, profiles] = await Promise.all([
    resolveCustomer(actor, request),
    prisma.senderProfile.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        isDefault: true,
        bankAccounts: {
          orderBy: { createdAt: 'asc' },
          select: bankAccountSelect,
        },
      },
    }),
  ]);
  const defaults = newInvoiceDefaults(
    today,
    profiles,
  );
  const partiesResult = resolveSenderAndAccount(request, profiles, {
    senderProfileId: defaults.senderProfileId,
    bankAccountId: defaults.bankAccountId,
  });

  const issues: DraftIssue[] = [];
  if ('issue' in customerResult) issues.push(customerResult.issue);
  if ('issue' in partiesResult) issues.push(partiesResult.issue);
  if (issues.length > 0 || !('customer' in customerResult) || !('chosen' in partiesResult)) {
    return { ok: false, issues };
  }

  const { chosen } = partiesResult;
  const issueDate: ResolvedParties['issueDate'] = request.issueDate
    ? { value: request.issueDate, source: 'REQUEST' }
    : { value: utcDateToDay(defaults.issueDate), source: 'DEFAULT' };
  return {
    ok: true,
    parties: {
      customer: customerResult.customer,
      senderProfile: chosen.senderProfile,
      bankAccount: chosen.bankAccount,
      currency: chosen.currency,
      issueDate,
      // Due 30 days after the issue date - the request's when it names one (review-2026-10-12 R-08).
      dueDate: request.dueDate
        ? { value: request.dueDate, source: 'REQUEST' }
        : { value: addDaysToDay(issueDate.value, 30), source: 'DEFAULT' },
    },
  };
}
