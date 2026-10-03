import type { NextRequest } from 'next/server';
import { handlers } from '@/auth'; // Referring to the auth.ts we just created
import { withoutSessionCookieExpiry } from '@/lib/helpers/session-cookies';

// T40/T44 (review-2026-10-03-rereview-2 S-04, rereview-3 T-01, AC-04): Auth.js's session endpoint
// clears the session cookie when it cannot decode the token or the session callback throws. The
// proxy never filters a route handler's response, so a direct visit (even a crafted link) would end
// the session while the check is failing. Auth.js parses the action with `split('/').filter(Boolean)`,
// so `//session` and `session/` reach that endpoint too: strip the expiry from EVERY GET, not one
// pathname. That is safe because no Auth.js GET legitimately clears the session cookie in this
// config: GET signout only renders a page (the clear happens on POST, left untouched below), and the
// callback's `sessionStore.clean()` only fires when `jwt` returns null, which auth.ts's `jwt` never
// does. A response that writes a session cookie (a refresh, or a sign-in whose `SessionStore.chunk()`
// expires stale chunk names) passes through whole, and every other cookie is kept.
export async function GET(request: NextRequest): Promise<Response> {
  return withoutSessionCookieExpiry(await handlers.GET(request));
}

export const { POST } = handlers;
