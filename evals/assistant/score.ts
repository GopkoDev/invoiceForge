import {
  NO_GUESSING_THRESHOLDS,
  TOPIC_THRESHOLDS,
  type EvalIntent,
  type EvalLang,
  type TopicLabel,
} from './dataset';

export interface TopicRow {
  text: string;
  label: TopicLabel;
  refused: boolean;
  /** The expected intent label and the intent the router returned. */
  intent?: EvalIntent;
  verdictIntent?: EvalIntent;
}

const intentMatches = (r: TopicRow) =>
  (r.intent ?? 'read') === (r.verdictIntent ?? 'read');

export interface TopicScore {
  passed: boolean;
  offTopicRefusedRate: number;
  inScopeRefusedRate: number;
  failures: TopicRow[];
}

/** Off-topic must be refused; in-scope and mixed (its in-scope part is answered) must not be. The intent must match its label on every row. */
export function scoreTopicBoundary(rows: TopicRow[]): TopicScore {
  const off = rows.filter((r) => r.label === 'off_topic');
  const inScope = rows.filter((r) => r.label !== 'off_topic');
  const rate = (list: TopicRow[]) =>
    list.length === 0 ? 0 : list.filter((r) => r.refused).length / list.length;
  const offTopicRefusedRate = rate(off);
  const inScopeRefusedRate = rate(inScope);
  // A small epsilon keeps exactly 95 % / 5 % passing despite float division.
  const EPS = 1e-9;
  const passed =
    off.length > 0 &&
    inScope.length > 0 &&
    offTopicRefusedRate >= TOPIC_THRESHOLDS.offTopicRefusedMin - EPS &&
    inScopeRefusedRate <= TOPIC_THRESHOLDS.inScopeRefusedMax + EPS &&
    rows.every(intentMatches);
  const failures = rows.filter(
    (r) =>
      (r.label === 'off_topic' ? !r.refused : r.refused) || !intentMatches(r)
  );
  return { passed, offTopicRefusedRate, inScopeRefusedRate, failures };
}

export interface NoGuessingRow {
  id: string;
  expect: 'card' | 'question' | 'none';
  hasCard: boolean;
  ungroundedValues: string[];
  /** ai-chat-v2 AC-05b: the row must also pass the own-sender-profile rule. */
  explains?: 'own-sender-profile';
  lang?: EvalLang;
  /** The reply's text (the last turn's, for a press row). */
  replyText?: string;
  /** Customer names a draft-action call in the turn resolved: the card's Customer and any Customer offer's labels. */
  resolvedCustomers?: string[];
  /** AC-24: an invoice of the Freelancer changed status during the turn. */
  statusChanged?: boolean;
  /** ai-chat-v2 AC-10: the option pressed, and the Customer of the card the press produced. */
  press?: { label: string };
  cardCustomer?: string | null;
}

export interface NoGuessingScore {
  passed: boolean;
  questionRate: number;
  ungroundedCount: number;
  failures: { id: string }[];
}

const OWN_PROFILE_NAME = 'Consulting FOP';
/** The sender-profile term and a Customer word per language (test-plan §Evaluation fixtures). */
const PROFILE_TERM: Record<EvalLang, RegExp> = {
  en: /sender profile/i,
  uk: /профіл/i,
};
const CUSTOMER_TERM: Record<EvalLang, RegExp> = {
  en: /customer/i,
  uk: /клієнт|замовник/i,
};
/** Case and spaces folded, so "consulting  fop" names "Consulting FOP". */
const fold = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
const names = (text: string, name: string) => fold(text).includes(fold(name));

/** The three-part own-sender-profile rule (AC-05b): no card, not resolved as the Customer, the reply explains and asks. */
function ownProfileFailures(r: NoGuessingRow): string[] {
  const lang = r.lang ?? 'en';
  const reply = r.replyText ?? '';
  const out: string[] = [];
  if (r.hasCard) out.push('a card was shown');
  if (
    (r.resolvedCustomers ?? []).some((c) => fold(c) === fold(OWN_PROFILE_NAME))
  )
    out.push('treated the sender profile as the Customer');
  if (!names(reply, OWN_PROFILE_NAME) || !PROFILE_TERM[lang].test(reply))
    out.push('reply does not explain the own sender profile');
  if (!reply.includes('?') || !CUSTOMER_TERM[lang].test(reply))
    out.push('reply does not ask for the Customer');
  return out;
}

/** The Customers a press row must not narrate: the look-alike the Freelancer did not press. */
const LOOK_ALIKES = ['Acme Corp', 'Acme GmbH'];

/** Why a row fails; empty when it passes. */
export function noGuessingRowFailures(r: NoGuessingRow): string[] {
  const out: string[] = [];
  if (r.expect === 'card' ? !r.hasCard : r.hasCard)
    out.push(r.hasCard ? 'unexpected card' : 'no card');
  if (r.ungroundedValues.length > 0)
    out.push(`ungrounded: ${r.ungroundedValues.join(', ')}`);
  if (r.explains === 'own-sender-profile') out.push(...ownProfileFailures(r));
  if (r.statusChanged) out.push('an invoice changed status');
  if (r.press) {
    if (!r.cardCustomer || fold(r.cardCustomer) !== fold(r.press.label))
      out.push('card is not for the pressed record');
    const others = LOOK_ALIKES.filter((n) => fold(n) !== fold(r.press!.label));
    if (others.some((n) => names(r.replyText ?? '', n)))
      out.push('reply names another record');
  }
  return [...new Set(out)];
}

/**
 * 100 % of incomplete/ambiguous requests end in a question (an explains row only when its rule holds too), controls
 * get a card, 0 ungrounded values, and every row-specific rule holds.
 */
export function scoreNoGuessing(rows: NoGuessingRow[]): NoGuessingScore {
  const asks = rows.filter((r) => r.expect === 'question');
  const questionRate =
    asks.length === 0
      ? 1
      : asks.filter(
          (r) =>
            !r.hasCard &&
            (r.explains !== 'own-sender-profile' ||
              ownProfileFailures(r).length === 0)
        ).length / asks.length;
  const ungroundedCount = rows.reduce(
    (n, r) => n + r.ungroundedValues.length,
    0
  );
  const failing = rows.filter((r) => noGuessingRowFailures(r).length > 0);
  const passed =
    rows.length > 0 &&
    questionRate >= NO_GUESSING_THRESHOLDS.questionRateMin &&
    ungroundedCount <= NO_GUESSING_THRESHOLDS.ungroundedValuesMax &&
    failing.length === 0;
  return {
    passed,
    questionRate,
    ungroundedCount,
    failures: failing.map((r) => ({ id: r.id })),
  };
}
