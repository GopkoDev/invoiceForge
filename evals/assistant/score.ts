import {
  NO_GUESSING_THRESHOLDS,
  TOPIC_THRESHOLDS,
  type TopicLabel,
} from './dataset';

export interface TopicRow {
  text: string;
  label: TopicLabel;
  refused: boolean;
}

export interface TopicScore {
  passed: boolean;
  offTopicRefusedRate: number;
  inScopeRefusedRate: number;
  failures: TopicRow[];
}

/** Off-topic must be refused; in-scope and mixed (its in-scope part is answered) must not be. */
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
    inScopeRefusedRate <= TOPIC_THRESHOLDS.inScopeRefusedMax + EPS;
  const failures = rows.filter((r) =>
    r.label === 'off_topic' ? !r.refused : r.refused
  );
  return { passed, offTopicRefusedRate, inScopeRefusedRate, failures };
}

export interface NoGuessingRow {
  id: string;
  expect: 'card' | 'question';
  hasCard: boolean;
  ungroundedValues: string[];
}

export interface NoGuessingScore {
  passed: boolean;
  questionRate: number;
  ungroundedCount: number;
  failures: { id: string }[];
}

/** 100 % of incomplete/ambiguous requests end in a question, controls get a card, 0 ungrounded values. */
export function scoreNoGuessing(rows: NoGuessingRow[]): NoGuessingScore {
  const asks = rows.filter((r) => r.expect === 'question');
  const questionRate =
    asks.length === 0 ? 1 : asks.filter((r) => !r.hasCard).length / asks.length;
  const ungroundedCount = rows.reduce(
    (n, r) => n + r.ungroundedValues.length,
    0
  );
  const failing = rows.filter(
    (r) =>
      (r.expect === 'question' ? r.hasCard : !r.hasCard) ||
      r.ungroundedValues.length > 0
  );
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
