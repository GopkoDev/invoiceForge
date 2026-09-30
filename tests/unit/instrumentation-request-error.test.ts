// T43 (N-10, AC-28, test-plan.md:109) — a page load failure is reported once by the action's
// failed(); the framework request-error hook must not report the thrown 'load_failed' again.
import { afterEach, describe, expect, it, vi } from 'vitest';

const captureRequestError = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureRequestError: (...args: unknown[]) => captureRequestError(...args),
}));

const { onRequestError } = await import('@/instrumentation');
const call = onRequestError as (...args: unknown[]) => unknown;

describe('onRequestError (T43, N-10)', () => {
  afterEach(() => captureRequestError.mockClear());

  it('skips the load_failed error an AC-28 page throws after its action already reported', () => {
    call(new Error('load_failed'), {}, {});
    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it('still reports any other request error', () => {
    call(new Error('boom'), {}, {});
    expect(captureRequestError).toHaveBeenCalledTimes(1);
  });
});
