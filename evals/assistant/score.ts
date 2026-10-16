import {
  NO_GUESSING_THRESHOLDS,
  TOPIC_THRESHOLDS,
  type EvalIntent,
  type EvalLang,
  type TopicLabel,
} from './dataset';
import { isInAppPath } from '@/lib/ai/in-app-links';

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
  expect: 'card' | 'question' | 'form' | 'card-or-form' | 'none';
  hasCard: boolean;
  ungroundedValues: string[];
  /** ai-chat-v2 AC-05b: the row must also pass the own-sender-profile rule. */
  explains?: 'own-sender-profile' | 'match-count';
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
  /** T65: the turn stored one Question form, and the fields of its questions. */
  hasForm?: boolean;
  formFields?: string[];
  /** The fields an `expect: 'form'` row's form must ask (AC-37). */
  expectFormFields?: string[];
  /** The tools the turn called, in order, and the arguments of each search_invoices call. */
  toolCalls?: string[];
  searchInvoicesArgs?: Array<Record<string, unknown>>;
  /** AC-47: Customers and products must be searched before the reply. */
  searchFirst?: boolean;
  /** AC-48/AC-49: the reply holds an allowlisted in-app link, to `expectedLinkPath` when set. */
  link?: boolean;
  expectedLinkPath?: string;
  /** AC-45: the card's issue date must be `expectIssueDate`; `cardIssueDate` is the card's (null: no card or no date). */
  expectIssueDate?: string;
  cardIssueDate?: string | null;
  /** AC-49: search_invoices must filter by this created-date range. */
  expectCreatedRange?: { from: string; to: string };
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
/** A request to choose the Customer counts as asking: with a form shown a prose question is forbidden (AC-37, owner decision 2026-10-16). */
const REQUEST_TO_CHOOSE_CUSTOMER: Record<'en' | 'uk', RegExp> = {
  en: /(choose|pick|select|name|tell me)[^.]*customer/i,
  uk: /(оберіть|виберіть|вкажіть|назвіть)[^.]*(клієнт|замовник)/i,
};

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
  const asksCustomer =
    reply.includes('?') && CUSTOMER_TERM[lang].test(reply);
  if (!asksCustomer && !REQUEST_TO_CHOOSE_CUSTOMER[lang].test(reply))
    out.push('reply does not ask for the Customer');
  return out;
}

/** One of the twelve Customers of the many-studios setup, "Studio A" .. "Studio L" (AC-14), as a whole name. */
const A_STUDIO = /\bstudio\s+[a-l]\b/i;

/** The match-count rule (AC-14): no card, the reply says how many match, and lists none of them. */
function matchCountFailures(r: NoGuessingRow): string[] {
  const reply = r.replyText ?? '';
  const out: string[] = [];
  if (r.hasCard) out.push('a card was shown');
  if (!/\b12\b/.test(reply)) out.push('reply does not say how many match');
  if (A_STUDIO.test(reply)) out.push('reply lists the matches');
  return out;
}

/** The row's own rule, if it has one. */
function explainsFailures(r: NoGuessingRow): string[] {
  if (r.explains === 'own-sender-profile') return ownProfileFailures(r);
  if (r.explains === 'match-count') return matchCountFailures(r);
  return [];
}

/** The Customers a press row must not narrate: the look-alike the Freelancer did not press. */
const LOOK_ALIKES = ['Acme Corp', 'Acme GmbH'];

/** A form row (AC-37, AC-46): one form with the expected questions, none for the sender profile, none in prose. */
function formFailures(r: NoGuessingRow): string[] {
  const out: string[] = [];
  if (!r.hasForm) out.push('no form');
  const asked = r.formFields ?? [];
  for (const f of r.expectFormFields ?? [])
    if (!asked.includes(f)) out.push(`form lacks ${f} question`);
  if (asked.includes('SENDER_PROFILE'))
    out.push('asked for the sender profile');
  if (/[?？]/.test(r.replyText ?? '')) out.push('question in prose');
  return out;
}

/** The Markdown links of a reply, as [text](href). */
const linkHrefs = (text: string): string[] =>
  [...text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((m) => m[1]);

const CANNOT_GIVE_LINKS =
  /(?:can(?:'|’)?t|cannot|unable to|not able to)\s+(?:give|provide|share|generate|create|send)[^.\n]*\blinks?\b|не\s+мож(?:у|на|емо)[^.\n]*посилан/i;

/** The link rule (AC-48, AC-49): an allowlisted in-app link, to the expected record, and no "I can't give links". */
function linkFailures(r: NoGuessingRow): string[] {
  const reply = r.replyText ?? '';
  const out: string[] = [];
  const hrefs = linkHrefs(reply).filter(isInAppPath);
  if (hrefs.length === 0) out.push('no in-app link');
  else if (r.expectedLinkPath && !hrefs.includes(r.expectedLinkPath))
    out.push('link is not to the expected record');
  if (CANNOT_GIVE_LINKS.test(reply)) out.push('says it cannot give links');
  return out;
}

const SEARCH_TOOLS = ['list_customers', 'list_products'];
const TOLD_TO_ADD =
  /\/(?:customers|products)\/new|\b(?:add|create)\s+(?:the\s+|a\s+)?(?:new\s+)?(?:customer|product)\b|(?:додайте|додати|створіть)\s+(?:клієнта|товар|продукт)/i;

/** The search-first rule (AC-47): Customers searched before any draft action, and no "add one" for a record that exists. */
function searchFirstFailures(r: NoGuessingRow): string[] {
  const calls = r.toolCalls ?? [];
  const firstDraft = calls.indexOf('propose_draft');
  const searched = calls.findIndex((t) => SEARCH_TOOLS.includes(t));
  const out: string[] = [];
  if (searched < 0 || (firstDraft >= 0 && firstDraft < searched))
    out.push('did not search before replying');
  if (TOLD_TO_ADD.test(r.replyText ?? ''))
    out.push('told to add a record that exists');
  return out;
}

const ASKS_ABOUT_DATE =
  /(?:which|what)\s+(?:date|day)|specify the date|яка\s+(?:саме\s+)?дата|яку\s+дату|який\s+(?:саме\s+)?день|вкажіть\s+дату/i;

/** The date rule (AC-45): the card carries the expected issue date, and the reply does not ask which day it is. */
function issueDateFailures(r: NoGuessingRow, expected: string): string[] {
  const out: string[] = [];
  if (r.cardIssueDate !== expected) out.push(`issue date is not ${expected}`);
  if (ASKS_ABOUT_DATE.test(r.replyText ?? '')) out.push('asked about the date');
  return out;
}

const SAYS_NONE =
  /\bno\s+(?:\w+\s+){0,3}(?:drafts?|invoices?)\b|\bnone\b|\bnot found\b|немає|нема\b|не\s+знайд|не\s+маєте|відсутн/i;

/** The created-date rule (AC-49): search_invoices filtered by the created range, and the reply does not say none exists. */
function createdRangeFailures(
  r: NoGuessingRow,
  range: { from: string; to: string }
): string[] {
  const out: string[] = [];
  if (
    !(r.searchInvoicesArgs ?? []).some(
      (a) => a.createdFrom === range.from && a.createdTo === range.to
    )
  )
    out.push('search did not filter by the created date');
  if (SAYS_NONE.test(r.replyText ?? ''))
    out.push('says no such invoice exists');
  return out;
}

/** Whether the row's reply must end in a card (or, for 'card-or-form', either). */
function shapeFailures(r: NoGuessingRow): string[] {
  switch (r.expect) {
    case 'card':
      return [
        ...(r.hasCard ? [] : ['no card']),
        ...(r.hasForm ? ['unexpected form'] : []),
      ];
    case 'form':
      return [...(r.hasCard ? ['unexpected card'] : []), ...formFailures(r)];
    case 'card-or-form':
      return r.hasCard || r.hasForm ? [] : ['no card or form'];
    default:
      return r.hasCard ? ['unexpected card'] : [];
  }
}

/** Why a row fails; empty when it passes. */
export function noGuessingRowFailures(r: NoGuessingRow): string[] {
  const out: string[] = shapeFailures(r);
  if (r.searchFirst) out.push(...searchFirstFailures(r));
  if (r.link) out.push(...linkFailures(r));
  if (r.expectIssueDate) out.push(...issueDateFailures(r, r.expectIssueDate));
  if (r.expectCreatedRange)
    out.push(...createdRangeFailures(r, r.expectCreatedRange));
  if (r.ungroundedValues.length > 0)
    out.push(`ungrounded: ${r.ungroundedValues.join(', ')}`);
  out.push(...explainsFailures(r));
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

/** T118: why each failing row failed, so a red run can be read without rerunning it. */
export function formatRowFailures(noGuessingRows: NoGuessingRow[], topicRows: TopicRow[]): string[] {
  const lines: string[] = [];
  for (const r of noGuessingRows) {
    const reasons = noGuessingRowFailures(r);
    if (reasons.length === 0) continue;
    lines.push(`  - ${r.id}: ${reasons.join('; ')}`);
    if (r.replyText) lines.push(`      reply: ${r.replyText.slice(0, 200)}`);
  }
  for (const r of scoreTopicBoundary(topicRows).failures) {
    lines.push(`  - topic: ${r.text}`);
    lines.push(`      expected ${r.label}/${r.intent ?? 'read'}, got ${r.refused ? 'refused' : 'answered'}/${r.verdictIntent ?? 'read'}`);
  }
  return lines;
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
      : asks.filter((r) => !r.hasCard && explainsFailures(r).length === 0)
          .length / asks.length;
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

/** Name of the variable that sets how many times the drafting-behaviour set is run. */
const RUNS_VARIABLE = 'ASSISTANT_EVAL_RUNS';

/** Passes a row needs out of `runs`: ceil(0.8 * runs), computed so 0.8 * 5 is not 4.000000000000001. */
export function defaultMinPasses(runs: number): number {
  return Math.ceil((runs * 8) / 10);
}

/** The run count from ASSISTANT_EVAL_RUNS (unset or empty: one run) and the passes a row needs. */
export function parseEvalRuns(raw: string | undefined): {
  runs: number;
  minPasses: number;
} {
  if (raw === undefined || raw === '') return { runs: 1, minPasses: 1 };
  if (!/^[1-9]\d*$/.test(raw))
    throw new Error(
      `${RUNS_VARIABLE} must be a positive whole number, got ${JSON.stringify(raw)}`
    );
  const runs = Number(raw);
  return { runs, minPasses: defaultMinPasses(runs) };
}

export interface RunsAggregate {
  passed: boolean;
  passCounts: Record<string, number>;
  failures: Array<{ id: string; passes: number; runs: number }>;
}

/** Each run maps a row id to whether it passed; a row must pass in at least `minPasses` runs. */
export function aggregateRuns(
  runs: Array<Record<string, boolean>>,
  { minPasses }: { minPasses: number }
): RunsAggregate {
  const passCounts: Record<string, number> = {};
  for (const run of runs)
    for (const [id, ok] of Object.entries(run))
      passCounts[id] = (passCounts[id] ?? 0) + (ok ? 1 : 0);
  const failures = Object.entries(passCounts)
    .filter(([, passes]) => passes < minPasses)
    .map(([id, passes]) => ({ id, passes, runs: runs.length }));
  return {
    passed: runs.length > 0 && failures.length === 0,
    passCounts,
    failures,
  };
}
