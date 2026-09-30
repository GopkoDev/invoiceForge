// T39 (spec.md §5 AC-21; review-2026-09-27.md F-34, F-35) — the client-side counterpart to
// unwrap-page-result.ts's UNAUTHORIZED handling. A server component page reaches
// requireLiveUser()/unwrapPageResult() and gets redirected server-side (T09/T26); a client
// component driving a server action (the invoice editor's save, GDPR account deletion, a
// contact card's delete, a PDF entry point) gets the same `UNAUTHORIZED` code back as plain
// `ActionResult` data instead, and a toast alone leaves the stale session sitting on screen
// (AC-21: "the device is treated as a Visitor: signed out, shown no data, and nothing is
// created"). This sends the browser through the same cookie-clearing route
// (`CLEAR_SESSION_PATH`) a server redirect would use, rather than looping through the proxy with
// an uncleared cookie.
import { CLEAR_SESSION_PATH } from '@/config/routes.config';

/** True for an ActionResult failure that means "treat this device as signed out" (AC-21). */
export function isUnauthorizedFailure(result: { success: boolean; code?: string }): boolean {
  return !result.success && result.code === 'UNAUTHORIZED';
}

// T42 (N-15): set once the device is on its way to sign-in, so a page's own beforeunload guard
// (the editor's unsaved-changes prompt) does not turn the redirect into a "Leave site?" dialog a
// stale session could answer with "Stay".
let redirectingToSignIn = false;

/** True once `goToSignIn` has started a navigation to the cookie-clearing route. */
export function isRedirectingToSignIn(): boolean {
  return redirectingToSignIn;
}

/** Full-page navigation to the cookie-clearing route (a GET route handler, not a page). */
export function goToSignIn(): void {
  redirectingToSignIn = true;
  window.location.assign(CLEAR_SESSION_PATH);
}

/**
 * Sends the device to sign-in when `result` is an UNAUTHORIZED failure. Returns whether it did,
 * so a caller can `if (redirectIfUnauthorized(result)) return;` before its own error handling.
 */
export function redirectIfUnauthorized(result: { success: boolean; code?: string }): boolean {
  if (isUnauthorizedFailure(result)) {
    goToSignIn();
    return true;
  }
  return false;
}
