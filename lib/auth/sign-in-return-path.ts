// AC-19: the proxy sends a Visitor who asked for a private page (such as an invoice link from an
// Assistant answer) to /login?callbackUrl=<path>. Sign-in returns there. Only a path on this app
// is ever followed; anything else lands on the default page, so the parameter cannot be used as an
// open redirect.
import { authRoutes } from '@/config/routes.config';

const LANDING_PATH = '/';

export function signInReturnPath(value: unknown): string {
  if (typeof value !== 'string') return LANDING_PATH;
  if (!value.startsWith('/') || value.startsWith('//')) return LANDING_PATH;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return LANDING_PATH;
  const pathname = value.split(/[?#]/)[0];
  const isAuthPage = Object.values(authRoutes).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  return isAuthPage ? LANDING_PATH : value;
}
