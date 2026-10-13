// ai-chat-v2 T10 (ADR-0002; sad.md §5 "Which issues become offers"; openapi StoredOfferOption, OfferOptionLabel):
// Offered choices are built in code from the draft resolver's typed issues, never from model text. The same issues
// always give the same options (AC-09); labels are fixed when offered (spec §1 "What a button shows").
import 'server-only';
import { z } from 'zod';
import { startSpan } from '@sentry/nextjs';
import type { Prisma, PrismaClient } from '@prisma/client';
import { foldName } from '@/lib/helpers/fold-name';
import { interpretCurrency } from '@/lib/services/assistant-drafts/currency-symbols';
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

/** A turn's Offered choices before saveTurn stores them; `id` is pre-generated so the `data-offer` part can carry it. */
export type PendingOffer = {
  id: string;
  kind: ChoiceOfferKind;
  lineIndex: number | null;
  request: DraftRequest;
  options: StoredOfferOption[];
};

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
  | { ok: false; failed?: true };

const UNAVAILABLE = { ok: false } as const;
/** A system failure while checking: the route answers "couldn't be completed", not "no longer available". */
const CHECK_FAILED = { ok: false, failed: true } as const;
/**
 * Whether a record priced in `code` fits the request's currency. The stored request keeps the currency as the
 * Freelancer wrote it ("$", "€", "dollars"), so it is read the way the resolver read it (review 2026-10-13 R1-B1);
 * a reading that stays unclear fits nothing.
 */
function currencyFits(code: string, written: string | undefined): boolean {
  if (written === undefined) return true;
  const reading = interpretCurrency(written, code);
  return reading.kind === 'RESOLVED' && reading.currency === code.trim().toUpperCase();
}

const REF_KEY: Record<ChoiceOfferKind, string> = {
  CUSTOMER: 'customerId',
  SENDER_PROFILE: 'senderProfileId',
  CURRENCY: 'currency',
  BANK_ACCOUNT: 'bankAccountId',
  PRODUCT: 'productId',
};

function refFitsKind(ref: OfferOptionRef, kind: ChoiceOfferKind, lineIndex: number | null, request: DraftRequest) {
  if (!(REF_KEY[kind] in ref)) return false;
  if (kind !== 'PRODUCT') return true;
  return lineIndex !== null && lineIndex >= 0 && lineIndex < (request.lines?.length ?? 0);
}

/** The sender profile a stored request drafts under, as the resolver picks it; null when it names none that exists. */
async function requestProfileId(userId: string, request: DraftRequest): Promise<string | null> {
  if (request.senderProfileId !== undefined) return request.senderProfileId;
  const prisma = await db();
  const profiles = await prisma.senderProfile.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, isDefault: true },
  });
  if (request.senderProfile !== undefined) {
    // As resolveSenderAndAccount: the exact folded name, else the one profile whose name contains it.
    const needle = foldName(request.senderProfile);
    const exact = profiles.find((p) => foldName(p.name) === needle);
    if (exact) return exact.id;
    const partial = profiles.filter((p) => foldName(p.name).includes(needle));
    return partial.length === 1 ? partial[0].id : null;
  }
  return (profiles.find((p) => p.isDefault) ?? profiles[0])?.id ?? null;
}

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
    return product !== null && currencyFits(product.currency, request.currency);
  }
  const account = await prisma.bankAccount.findFirst({
    where: { id: ref.bankAccountId, senderProfile: { userId } },
    select: { senderProfileId: true, currency: true },
  });
  if (!account) return false;
  // The account must be in the profile the resolver would draft under now: the request's profile id, the profile it
  // names (folded name), or the current default (review 2026-10-13 R12-1). Otherwise the pinned turn could not use it.
  if (account.senderProfileId !== (await requestProfileId(userId, request))) return false;
  return currencyFits(account.currency, request.currency);
}

/**
 * A press refers to an option of the Conversation's open offer, never to a record id (ADR-0003). Every cause of a
 * refusal answers the same `{ ok: false }` (AC-12b); a system failure answers `{ ok: false, failed: true }`. Writes nothing;
 * span `chat.choice-check` carries the outcome only.
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
      result = CHECK_FAILED;
    }
    span?.setAttribute('outcome', result.ok ? 'ok' : 'failed' in result ? 'failed' : 'unavailable');
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
  // The option must fit the slot it fills, so pinning it can never fail (pinChoice throws on a mismatch).
  if (!option || !refFitsKind(option.ref, row.kind, row.lineIndex, request)) return UNAVAILABLE;
  if (!(await stillFits(actor, option.ref, request))) return UNAVAILABLE;
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

/**
 * CHOSEN → OPEN after a press that was not counted; a no-op for any other state. When a newer message was saved
 * meanwhile (a typed turn in another tab, with or without its own offer), the released offer ends CLOSED and
 * unmarked instead: its reply is no longer the latest, so its buttons must not become pressable again, and there is
 * at most one OPEN offer per Conversation (review 2026-10-13 R1-B2, R2-B1). The Conversation row is locked first,
 * the same lock saveTurn takes, so no message appears between the check and the update.
 */
export async function releaseOffer(tx: Tx, offerId: string): Promise<void> {
  const claimed = await tx.choiceOffer.findFirst({
    where: { id: offerId, state: 'CHOSEN' },
    select: { conversationId: true, message: { select: { position: true } } },
  });
  if (!claimed) return;
  await tx.$queryRaw`SELECT 1 FROM "Conversation" WHERE id = ${claimed.conversationId} FOR UPDATE`;
  const newer = await tx.conversationMessage.count({
    where: { conversationId: claimed.conversationId, position: { gt: claimed.message.position } },
  });
  await tx.choiceOffer.updateMany({
    where: { id: offerId, state: 'CHOSEN' },
    data: { state: newer > 0 ? 'CLOSED' : 'OPEN', chosenOptionId: null },
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
