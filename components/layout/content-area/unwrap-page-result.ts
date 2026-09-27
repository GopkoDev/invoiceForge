import { notFound, redirect } from 'next/navigation';
import { CLEAR_SESSION_PATH } from '@/config/routes.config';
import type { ActionResult } from '@/types/actions';

// T26 (spec.md §5 AC-28, AC-29; adr/0009; contracts/server-actions.md §ActionResult, "Code →
// destination" table) — the single mapping every AC-28 page uses to turn a loader's
// `ActionResult` into either data, `notFound()` (SCR-16, NOT_FOUND — identical for a missing and
// a foreign record) or a thrown Error that the segment `error.tsx` boundary catches (SCR-17,
// retry + Sentry). `UNAUTHORIZED` means a token without a live account (ADR-0002) surviving past
// the layout guard; the page sends it through the cookie-clearing route to sign-in (a direct
// redirect to sign-in would loop through the proxy) rather than showing a generic error. Every
// other non-success code (`FAILED`, plus `VALIDATION`/`CONFLICT` which page loaders never
// return) is treated as a load failure — never rendered as an empty state.
export function unwrapPageResult<T>(result: ActionResult<T>): T {
  if (result.success) {
    return result.data;
  }

  if (result.code === 'NOT_FOUND') {
    notFound();
  }

  if (result.code === 'UNAUTHORIZED') {
    redirect(CLEAR_SESSION_PATH);
  }

  throw new Error('load_failed');
}
