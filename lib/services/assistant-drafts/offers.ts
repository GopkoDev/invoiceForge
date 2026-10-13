// ai-chat-v2 T10 (ADR-0002; sad.md §5 "Which issues become offers"; openapi StoredOfferOption, OfferOptionLabel):
// Offered choices are built in code from the draft resolver's typed issues, never from model text. The same issues
// always give the same options (AC-09); labels are fixed when offered (spec §1 "What a button shows").
import 'server-only';
import { z } from 'zod';
import { foldName } from '@/lib/helpers/fold-name';
import { interpretCurrency } from '@/lib/services/assistant-drafts/currency-symbols';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import type { ChoiceOfferKind, ChoiceOfferState, FormField, FormView } from '@/types/assistant/types';
import { formHeading } from '@/lib/services/assistant-drafts/form-headings';
import type { DraftRequest } from '@/lib/services/assistant-drafts/schema';

/** At most this many buttons; above it the reply states the count instead (AC-14). */
export const MAX_OFFER_OPTIONS = 8;

export const CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'] as const;
export type Currency = (typeof CURRENCIES)[number];
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

type Profile = { senderProfileId: string; name: { freelancerText: string } };

export const isCurrency = (code: string): code is Currency => (CURRENCIES as readonly string[]).includes(code);

/** A Customer's saved name; with its email (or "no email") only when another offered name folds equal (AC-10). */
export function customerOptions(candidates: Array<{ customerId: string; name: { freelancerText: string }; email: string | null }>) {
  const folded = candidates.map((c) => foldName(c.name.freelancerText));
  return candidates.map((c, i) => {
    const name = c.name.freelancerText;
    const lookAlike = folded.some((f, j) => j !== i && f === folded[i]);
    const label = lookAlike ? `${name} (${c.email ?? 'no email'})` : name;
    return { label, ref: { customerId: c.customerId } };
  });
}

export const profileOptions = (profiles: Profile[]) =>
  profiles.map((p) => ({ label: p.name.freelancerText, ref: { senderProfileId: p.senderProfileId } }));

export const accountOptions = (
  accounts: Array<{ bankAccountId: string; bankName: { freelancerText: string }; lastFour: string; currency: string }>
) =>
  accounts.map((a) => ({
    label: `${a.bankName.freelancerText} ••${a.lastFour} · ${a.currency}`,
    ref: { bankAccountId: a.bankAccountId },
  }));

/** A product option: name, unit and the price in the invoice currency (spec §1 "What a button shows"). */
export const productOptions = (
  candidates: Array<{ productId: string; name: { freelancerText: string }; unit: string; price: string; currency: string }>
) =>
  candidates.map((p) => ({
    label: `${p.name.freelancerText} · ${p.unit} · ${p.price} ${p.currency}`,
    ref: { productId: p.productId },
  }));

// ---------- revision 2026-10-13 T51 (spec §1 F9a; data-model 08): the legacy reader ----------

const backfilledQuestionSchema = z
  .object({ questionId: z.literal(0), options: storedOfferOptionsSchema })
  .passthrough();
const legacyAnswersSchema = z.array(z.object({ questionId: z.literal(0), optionId: z.number().int().min(0) }).strict()).length(1);

/**
 * A pre-revision offer row read as a one-question form (F9a): the question's field is the row's kind, its heading the
 * app's heading for that field, its options the frozen labels, with no "Other…" input. The backfilled `questions` and
 * `answers` (08) are read when present, else the same view is built from kind, options and chosenOptionId.
 */
export function offerRowToFormView(row: {
  id: string;
  kind: ChoiceOfferKind;
  state: ChoiceOfferState;
  lineIndex: number | null;
  options: unknown;
  chosenOptionId: number | null;
  questions: unknown;
  answers: unknown;
}): FormView {
  if (row.kind === 'FORM') throw new Error('A FORM row is read by toFormView.');
  const field: FormField = row.kind;
  const backfilled = Array.isArray(row.questions) ? backfilledQuestionSchema.safeParse(row.questions[0]) : null;
  const options = backfilled?.success ? backfilled.data.options : storedOfferOptionsSchema.parse(row.options);
  const stored = row.answers === null ? null : legacyAnswersSchema.safeParse(row.answers);
  const chosen = stored?.success ? stored.data[0].optionId : row.chosenOptionId;
  return {
    formId: row.id,
    state: row.state,
    questions: [
      {
        questionId: 0,
        field,
        lineIndex: row.lineIndex,
        heading: formHeading(field, row.lineIndex),
        prompt: null,
        options: options.map(({ optionId, label }) => ({ optionId, label })),
        input: 'NONE',
        required: true,
        skippable: false,
        matchCount: null,
      },
    ],
    answers: row.state === 'CHOSEN' && chosen !== null ? [{ questionId: 0, optionId: chosen }] : null,
  };
}

// ---------- ai-chat-v2 T12: the press check, claim and release (server-actions.md §Chat route internals) ----------


// Lazy: the pure builder above must load without DATABASE_URL (unit tests).
export const db = async () => (await import('@/prisma')).prisma;

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

/**
 * The currency a request with no written currency is drafted in now, from the resolver itself (one source with the
 * pinned turn; T32, review 2026-10-13 R14-1): the parties' currency, also when only the Customer failed. Null when
 * the parties cannot tell (no profile or account resolved).
 */
async function draftingCurrency(actor: ActingFreelancer, request: DraftRequest): Promise<string | null> {
  const [{ resolveParties }, { todayInZone }] = await Promise.all([
    import('@/lib/services/assistant-drafts/resolve-parties'),
    import('@/lib/helpers/calendar-day'),
  ]);
  const parties = await resolveParties(actor, request, todayInZone(actor.timeZone));
  return parties.ok ? parties.parties.currency : (parties.currency ?? null);
}

/** Whether the option's record still exists, is the actor's and still fits the stored request (AC-13). */
export async function stillFits(
  actor: ActingFreelancer,
  ref: OfferOptionRef,
  request: DraftRequest | null
): Promise<boolean> {
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
    if (product === null) return false;
    if (request === null) return true; // a form with no stored request: existence and ownership only
    if (request.currency !== undefined) return currencyFits(product.currency, request.currency);
    // No currency written: the invoice is drafted in the account's currency the resolver would use now (R13-2).
    const drafting = await draftingCurrency(actor, request);
    return drafting === null || drafting === product.currency;
  }
  const account = await prisma.bankAccount.findFirst({
    where: { id: ref.bankAccountId, senderProfile: { userId } },
    select: { senderProfileId: true, currency: true },
  });
  if (!account) return false;
  if (request === null) return true;
  // The account must be in the profile the resolver would draft under now: the request's profile id, the profile it
  // names (folded name), or the current default (review 2026-10-13 R12-1). Otherwise the pinned turn could not use it.
  if (account.senderProfileId !== (await requestProfileId(userId, request))) return false;
  return currencyFits(account.currency, request.currency);
}
