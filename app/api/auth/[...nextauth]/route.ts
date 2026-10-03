import type { NextRequest } from 'next/server';
import { handlers } from '@/auth'; // Referring to the auth.ts we just created
import { withoutSessionCookieExpiry } from '@/lib/helpers/session-cookies';

// T40 (review-2026-10-03-rereview-2 S-04, AC-04): Auth.js's session endpoint clears the session
// cookie when it cannot decode the token or the session callback throws. The proxy never filters a
// route handler's response, so a direct visit (even a crafted link) would end the session while the
// check is failing. Strip the expiry from that one GET; sign-out and the other endpoints still set
// and clear cookies as Auth.js intends.
const SESSION_ENDPOINT = '/api/auth/session';

export async function GET(request: NextRequest): Promise<Response> {
  const response = await handlers.GET(request);
  return request.nextUrl.pathname === SESSION_ENDPOINT
    ? withoutSessionCookieExpiry(response)
    : response;
}

export const { POST } = handlers;
