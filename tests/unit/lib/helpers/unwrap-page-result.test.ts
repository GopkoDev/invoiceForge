// T39 (spec.md §5 AC-28; review-2026-09-27.md F-38) —
// docs/features/architecture-hardening/tasks.json T39, cite
// components/layout/content-area/unwrap-page-result.ts:27.
//
// AC-28 (verbatim): "... the failure is reported to error monitoring." unwrapPageResult() throws
// a bare `new Error('load_failed')` for a FAILED loader result, and app/(protected)/error.tsx
// (and its invoice-editor twin) call `Sentry.captureException(error)` on whatever they catch —
// so today Sentry only ever sees the string "load_failed", never the loader's own `error`/`code`,
// making every AC-28 load failure indistinguishable in error monitoring.
//
// RED (T39 not yet implemented): the thrown Error has no `cause`, so `error.cause` is
// `undefined` below.
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/types/actions';

const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const redirectMock = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (path: string) => redirectMock(path),
}));

const { unwrapPageResult } = await import(
  '@/components/layout/content-area/unwrap-page-result'
);

describe('unwrapPageResult — FAILED reports its cause to error monitoring (T39, F-38, AC-28)', () => {
  it('throws with the failed ActionResult attached as `cause`, not a bare message', () => {
    const result: ActionResult<never> = {
      success: false,
      code: 'FAILED',
      error: 'Failed to fetch invoices.',
    };

    let thrown: unknown;
    try {
      unwrapPageResult(result);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBe(result);
  });

  it('still redirects to sign-in for UNAUTHORIZED and calls notFound for NOT_FOUND', () => {
    expect(() =>
      unwrapPageResult({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' })
    ).toThrow('NEXT_REDIRECT:/api/auth/clear-session');

    expect(() =>
      unwrapPageResult({ success: false, code: 'NOT_FOUND', error: 'Not found.' })
    ).toThrow('NEXT_NOT_FOUND');
  });
});
