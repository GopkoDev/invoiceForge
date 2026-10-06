import type { NextRequest } from 'next/server';
import { handlers } from '@/auth'; // Referring to the auth.ts we just created
import { withoutSessionCookieExpiry } from '@/lib/helpers/session-cookies';

// AC-04: Auth.js's session endpoint clears the session cookie when it cannot decode the token or
// the session callback throws, and the proxy never filters a route handler's response. Auth.js
// parses the action with `split('/').filter(Boolean)`, so `//session` and `session/` reach that
// endpoint too: strip the expiry from EVERY GET. Safe because no Auth.js GET clears the cookie in
// this config: signout clears on POST, and `sessionStore.clean()` fires only when `jwt` returns
// null, which auth.ts's `jwt` never does. A response that writes a session cookie passes through.
export async function GET(request: NextRequest): Promise<Response> {
  return withoutSessionCookieExpiry(await handlers.GET(request));
}

export const { POST } = handlers;
