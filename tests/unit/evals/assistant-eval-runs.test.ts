// ai-chat-v2 T65 (test-plan.md: each drafting-behaviour row passes in >= 4 of 5 runs against the configured model):
// the pure pieces of the multi-run pass-rate. The real model is never called here.
// `pnpm eval:assistant` hands its arguments to vitest, so the run count comes from ASSISTANT_EVAL_RUNS.
import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  defaultMinPasses,
  parseEvalRuns,
} from '@/evals/assistant/score';

/** One run's results, keyed by row id: true when the row passed in that run. */
const run = (results: Record<string, boolean>) => results;

describe('parseEvalRuns: the run count from ASSISTANT_EVAL_RUNS', () => {
  it('defaults to one run needing one pass when unset or empty', () => {
    expect(parseEvalRuns(undefined)).toEqual({ runs: 1, minPasses: 1 });
    expect(parseEvalRuns('')).toEqual({ runs: 1, minPasses: 1 });
  });

  it('needs ceil(0.8 * runs) passes', () => {
    expect(parseEvalRuns('5')).toEqual({ runs: 5, minPasses: 4 });
    expect(parseEvalRuns('3')).toEqual({ runs: 3, minPasses: 3 });
    expect(parseEvalRuns('10')).toEqual({ runs: 10, minPasses: 8 });
    expect(defaultMinPasses(5)).toBe(4);
    expect(defaultMinPasses(1)).toBe(1);
  });

  it.each(['0', '-1', '2.5', 'abc', '5x', ' '])('rejects %j', (raw) => {
    expect(() => parseEvalRuns(raw)).toThrow(/ASSISTANT_EVAL_RUNS/);
  });
});

describe('aggregateRuns: >= 4 of 5 runs per row', () => {
  const opts = { minPasses: 4 };

  it('passes a row at exactly 4 of 5 and at 5 of 5, and counts the passes', () => {
    const runs = [
      run({ a: true, b: true }),
      run({ a: true, b: true }),
      run({ a: true, b: false }),
      run({ a: true, b: true }),
      run({ a: true, b: true }),
    ];
    const result = aggregateRuns(runs, opts);
    expect(result.passed).toBe(true);
    expect(result.passCounts).toEqual({ a: 5, b: 4 });
    expect(result.failures).toEqual([]);
  });

  it('fails a row that passes in only 3 of 5 runs and names it', () => {
    const runs = [
      run({ a: true, b: true }),
      run({ a: true, b: false }),
      run({ a: true, b: false }),
      run({ a: true, b: true }),
      run({ a: true, b: true }),
    ];
    const result = aggregateRuns(runs, opts);
    expect(result.passed).toBe(false);
    expect(result.passCounts).toEqual({ a: 5, b: 3 });
    expect(result.failures).toEqual([{ id: 'b', passes: 3, runs: 5 }]);
  });

  it('with one run needs the row to pass, as today', () => {
    expect(aggregateRuns([run({ a: true })], { minPasses: 1 }).passed).toBe(true);
    const failed = aggregateRuns([run({ a: true, b: false })], { minPasses: 1 });
    expect(failed.passed).toBe(false);
    expect(failed.failures).toEqual([{ id: 'b', passes: 0, runs: 1 }]);
  });

  it('does not pass with no runs', () => {
    expect(aggregateRuns([], opts).passed).toBe(false);
  });
});
