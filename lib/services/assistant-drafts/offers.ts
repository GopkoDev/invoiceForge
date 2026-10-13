// ai-chat-v2 T10 (ADR-0002; sad.md §5 "Which issues become offers"; openapi StoredOfferOption, OfferOptionLabel):
// Offered choices are built in code from the draft resolver's typed issues, never from model text. The same issues
// always give the same options (AC-09); labels are fixed when offered (spec §1 "What a button shows").
import 'server-only';
import { z } from 'zod';
import { startSpan } from '@sentry/nextjs';
import type { Prisma, PrismaClient } from '@prisma/client';
import { foldName } from '@/lib/helpers/fold-name';
import { redactError } from '@/lib/helpers/prisma-error-scrub';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { reserveMessageSlot, type ReserveResult } from '@/lib/services/assistant-usage/allowance';
import type { ChoiceOfferKind } from '@/types/assistant/types';
import type { DraftIssue, DraftRequest } from '@/lib/services/assistant-drafts/schema';

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

// ---------- ai-chat-v2 T12: the press check, claim and release (server-actions.md §Chat route internals) ----------

type Tx = Prisma.TransactionClient | PrismaClient;

// Lazy: the pure builder above must load without DATABASE_URL (unit tests).
const db = async () => (await import('@/prisma')).prisma;

export type CheckedChoice =
  | {
      ok: true;
      offer: { id: string; kind: ChoiceOfferKind; lineIndex: number | null; request: DraftRequest };
      option: StoredOfferOption;
    }
  | { ok: false };

const UNAVAILABLE = { ok: false } as const;
const sameCode = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/** Whether the option's record still exists, is the actor's and still fits the stored request (AC-13). */
async function stillFits(actor: ActingFreelancer, ref: OfferOptionRef, request: DraftRequest): Promise<boolean> {
  const prisma = await db();
  const { userId } = actor;
  if ('currency' in ref) return true;
  if ('customerId' in ref) return (await prisma.customer.count({ where: { id: ref.customerId, userId } })) === 1;
  if ('senderProfileId' in ref) {
    return (await prisma.senderProfile.count({ where: { id: ref.senderProfileId, userId } })) === 1;
  }
  if ('productId' in ref) {
    const product = await prisma.product.findFirst({
      where: { id: ref.productId, userId, isActive: true },
      select: { currency: true },
    });
    return product !== null && (request.currency === undefined || sameCode(product.currency, request.currency));
  }
  const account = await prisma.bankAccount.findFirst({
    where: { id: ref.bankAccountId, senderProfile: { userId } },
    select: { senderProfileId: true, currency: true },
  });
  if (!account) return false;
  if (request.senderProfileId !== undefined && account.senderProfileId !== request.senderProfileId) return false;
  return request.currency === undefined || sameCode(account.currency, request.currency);
}

/**
 * A press refers to an option of the Conversation's open offer, never to a record id (ADR-0003). Every cause of a
 * refusal answers the same `{ ok: false }` (AC-12b). Writes nothing; span `chat.choice-check` carries the outcome only.
 */
export function checkChoice(
  actor: ActingFreelancer,
  input: { conversationId: string; offerId: string; optionId: number }
): Promise<CheckedChoice> {
  return startSpan({ name: 'chat.choice-check', op: 'function' }, async (span) => {
    let result: CheckedChoice = UNAVAILABLE;
    try {
      result = await check(actor, input);
    } catch (error) {
      console.error('[checkChoice] failed:', redactError(error));
    }
    span?.setAttribute('outcome', result.ok ? 'ok' : 'unavailable');
    return result;
  });
}

async function check(
  actor: ActingFreelancer,
  input: { conversationId: string; offerId: string; optionId: number }
): Promise<CheckedChoice> {
  const row = await (await db()).choiceOffer.findFirst({
    where: { id: input.offerId, userId: actor.userId, state: 'OPEN' },
    select: { id: true, conversationId: true, kind: true, lineIndex: true, request: true, options: true },
  });
  if (!row || row.conversationId !== input.conversationId) return UNAVAILABLE;
  const options = storedOfferOptionsSchema.safeParse(row.options);
  if (!options.success) return UNAVAILABLE;
  // Written by saveTurn from the resolver's own request (ADR-0003), never from the client.
  const request = row.request as DraftRequest;
  const option = options.data.find((o) => o.optionId === input.optionId);
  if (!option || !(await stillFits(actor, option.ref, request))) return UNAVAILABLE;
  return {
    ok: true,
    offer: { id: row.id, kind: row.kind, lineIndex: row.lineIndex, request },
    option,
  };
}

/** OPEN → CHOSEN; false when another press claimed it first or it is not the actor's open offer. */
export async function claimOffer(tx: Tx, actor: ActingFreelancer, offerId: string, optionId: number): Promise<boolean> {
  const { count } = await tx.choiceOffer.updateMany({
    where: { id: offerId, userId: actor.userId, state: 'OPEN' },
    data: { state: 'CHOSEN', chosenOptionId: optionId },
  });
  return count === 1;
}

/** CHOSEN → OPEN after a press that was not counted; a no-op for any other state. */
export async function releaseOffer(tx: Tx, offerId: string): Promise<void> {
  await tx.choiceOffer.updateMany({
    where: { id: offerId, state: 'CHOSEN' },
    data: { state: 'OPEN', chosenOptionId: null },
  });
}

/**
 * A valid press takes one slot of today's allowance and claims its offer in one transaction (Critical flow 1,
 * AC-11): no slot left → nothing claimed; a lost claim → the slot is not taken. `release` gives both back together.
 */
export function reserveAndClaim(
  actor: ActingFreelancer,
  now: Date,
  offerId: string,
  optionId: number
): Promise<ReserveResult> {
  return reserveMessageSlot(actor, now, {
    claim: (tx) => claimOffer(tx, actor, offerId, optionId),
    release: (tx) => releaseOffer(tx, offerId),
  });
}
