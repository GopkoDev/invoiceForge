// ai-chat-v2 T10 (ADR-0002; sad.md §5 "Which issues become offers"; openapi StoredOfferOption, OfferOptionLabel):
// Offered choices are built in code from the draft resolver's typed issues, never from model text. The same issues
// always give the same options (AC-09); labels are fixed when offered (spec §1 "What a button shows").
import 'server-only';
import { z } from 'zod';
import { foldName } from '@/lib/helpers/fold-name';
import type { ChoiceOfferKind } from '@/types/assistant/types';
import type { DraftIssue } from '@/lib/services/assistant-drafts/schema';

/** At most this many buttons; above it the reply states the count instead (AC-14). */
export const MAX_OFFER_OPTIONS = 8;

const CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'] as const;
type Currency = (typeof CURRENCIES)[number];
const recordId = z.string().min(1).max(64);

export const offerOptionRefSchema = z.union([
  z.object({ customerId: recordId }).strict(),
  z.object({ senderProfileId: recordId }).strict(),
  z.object({ bankAccountId: recordId }).strict(),
  z.object({ productId: recordId }).strict(),
  z.object({ currency: z.enum(CURRENCIES) }).strict(),
]);
export type OfferOptionRef = z.infer<typeof offerOptionRefSchema>;

export const storedOfferOptionSchema = z
  .object({
    optionId: z.number().int().min(0).max(MAX_OFFER_OPTIONS - 1),
    label: z.string().min(1).max(600),
    ref: offerOptionRefSchema,
  })
  .strict();
export type StoredOfferOption = z.infer<typeof storedOfferOptionSchema>;

export const storedOfferOptionsSchema = z.array(storedOfferOptionSchema).min(1).max(MAX_OFFER_OPTIONS);

export type OfferFromIssues =
  | { kind: 'OFFER'; offerKind: ChoiceOfferKind; lineIndex: number | null; options: StoredOfferOption[] }
  | { kind: 'TOO_MANY'; count: number }
  | { kind: 'NONE' };

type Found = { offerKind: ChoiceOfferKind; lineIndex: number | null; options: Array<Omit<StoredOfferOption, 'optionId'>> };
type Profile = { senderProfileId: string; name: { freelancerText: string } };

const isCurrency = (code: string): code is Currency => (CURRENCIES as readonly string[]).includes(code);

/** A Customer's saved name; with its email (or "no email") only when another offered name folds equal (AC-10). */
function customerOptions(candidates: Array<{ customerId: string; name: { freelancerText: string }; email: string | null }>) {
  const folded = candidates.map((c) => foldName(c.name.freelancerText));
  return candidates.map((c, i) => {
    const name = c.name.freelancerText;
    const lookAlike = folded.some((f, j) => j !== i && f === folded[i]);
    const label = lookAlike ? `${name} (${c.email ?? 'no email'})` : name;
    return { label, ref: { customerId: c.customerId } };
  });
}

const profileOptions = (profiles: Profile[]) =>
  profiles.map((p) => ({ label: p.name.freelancerText, ref: { senderProfileId: p.senderProfileId } }));

const accountOptions = (
  accounts: Array<{ bankAccountId: string; bankName: { freelancerText: string }; lastFour: string; currency: string }>
) =>
  accounts.map((a) => ({
    label: `${a.bankName.freelancerText} ••${a.lastFour} · ${a.currency}`,
    ref: { bankAccountId: a.bankAccountId },
  }));

/** The options one issue offers, by kind; null for a kind that is never an offer (a value to type, a link). */
function optionsOf(issue: DraftIssue): Found | null {
  switch (issue.kind) {
    case 'CUSTOMER_AMBIGUOUS':
    case 'CUSTOMER_NEAR_MISS':
      return { offerKind: 'CUSTOMER', lineIndex: null, options: customerOptions(issue.candidates) };
    case 'SENDER_PROFILE_NOT_FOUND':
      return { offerKind: 'SENDER_PROFILE', lineIndex: null, options: profileOptions(issue.profiles) };
    case 'DEFAULT_PROFILE_WITHOUT_ACCOUNT':
    case 'NO_ACCOUNT_IN_CURRENCY':
      return { offerKind: 'SENDER_PROFILE', lineIndex: null, options: profileOptions(issue.otherProfiles) };
    case 'CURRENCY_UNCLEAR':
      return {
        offerKind: 'CURRENCY',
        lineIndex: null,
        options: issue.options.filter(isCurrency).map((code) => ({ label: code, ref: { currency: code } })),
      };
    case 'SEVERAL_ACCOUNTS_IN_CURRENCY':
    case 'BANK_ACCOUNT_NOT_FOUND':
    case 'BANK_ACCOUNT_AMBIGUOUS':
      return { offerKind: 'BANK_ACCOUNT', lineIndex: null, options: accountOptions(issue.accounts) };
    case 'PRODUCT_AMBIGUOUS':
      return {
        offerKind: 'PRODUCT',
        lineIndex: issue.lineIndex,
        options: issue.candidates.map((p) => ({
          label: `${p.name.freelancerText} · ${p.unit} · ${p.price} ${p.currency}`,
          ref: { productId: p.productId },
        })),
      };
    default:
      return null;
  }
}

/** The order a draft is resolved in, so the first question asked is the first one that blocks the draft. */
const PRECEDENCE: readonly ChoiceOfferKind[] = ['CUSTOMER', 'SENDER_PROFILE', 'CURRENCY', 'BANK_ACCOUNT', 'PRODUCT'];

/**
 * At most one offer per reply: the first offer-able issue in the order Customer → sender profile → currency → bank
 * account → product. 1..8 options; above 8 no offer, only the count (AC-14). `invoiceCurrency` is the currency the
 * product candidates are priced in (they already are; kept for the contract's signature).
 */
export function offerFromIssues(
  issues: readonly DraftIssue[],
  ctx: { invoiceCurrency?: string | null } = {}
): OfferFromIssues {
  void ctx;
  const found = issues.map(optionsOf).filter((f): f is Found => f !== null && f.options.length > 0);
  for (const kind of PRECEDENCE) {
    const first = found.find((f) => f.offerKind === kind);
    if (!first) continue;
    if (first.options.length > MAX_OFFER_OPTIONS) return { kind: 'TOO_MANY', count: first.options.length };
    return {
      kind: 'OFFER',
      offerKind: first.offerKind,
      lineIndex: first.lineIndex,
      options: first.options.map((o, optionId) => ({ optionId, ...o }) as StoredOfferOption),
    };
  }
  return { kind: 'NONE' };
}
