// editor-ux T31 (review S2): with CI set, a missing container runtime must FAIL the e2e run
// instead of skipping every test and exiting 0. Assumed interface (implementer to add):
// containerRuntimeDecision({ ci, available }) -> 'run' | 'skip' | 'fail'
import { describe, expect, it } from 'vitest';
import { containerRuntimeDecision } from '../support/db/docker-availability';

describe('containerRuntimeDecision (T31)', () => {
  it('runs when the runtime is available, in CI or not', () => {
    expect(containerRuntimeDecision({ ci: true, available: true })).toBe('run');
    expect(containerRuntimeDecision({ ci: false, available: true })).toBe('run');
  });
  it('fails in CI when the runtime is unavailable', () => {
    expect(containerRuntimeDecision({ ci: true, available: false })).toBe('fail');
  });
  it('skips locally when the runtime is unavailable', () => {
    expect(containerRuntimeDecision({ ci: false, available: false })).toBe('skip');
  });
});
