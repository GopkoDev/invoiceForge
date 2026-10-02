export const legalRoutes = { privacy: '/privacy', terms: '/terms' } as const;

export const publicRoutes = {
  landing: '/',
} as const;

export const authRoutes = {
  signIn: '/login',
  verifyRequest: '/verify-request',
  error: '/error',
} as const;

const protectedRoutesBase = {
  dashboard: '/dashboard',
  invoices: '/invoices',
  senderProfiles: '/sender-profiles',
  customers: '/customers',
  products: '/products',
  settings: '/settings',
} as const;

/** The root of every private section; each one and everything under it needs a session. */
export const privateSectionRoots = Object.values(protectedRoutesBase);

export const protectedRoutes = {
  ...protectedRoutesBase,

  settingsProfile: '/settings/profile',
  settingsPrivacy: '/settings/privacy',

  senderProfilesNew: `${protectedRoutesBase.senderProfiles}/new`,
  senderProfileDetail: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}` as const,
  senderProfileEdit: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}/edit` as const,
  senderProfileEditTab: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}/edit/profile` as const,
  senderProfileEditBankAccounts: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}/edit/bank-accounts` as const,

  customersNew: `${protectedRoutesBase.customers}/new`,
  customerDetail: (id: string) =>
    `${protectedRoutesBase.customers}/${id}` as const,
  customerEdit: (id: string) =>
    `${protectedRoutesBase.customers}/${id}/edit` as const,

  productsNew: `${protectedRoutesBase.products}/new`,
  productEdit: (id: string) =>
    `${protectedRoutesBase.products}/${id}/edit` as const,
  productCustomPrices: (id: string) =>
    `${protectedRoutesBase.products}/${id}/custom-prices` as const,

  invoicesNew: `${protectedRoutesBase.invoices}/new`,
  invoiceEdit: (id: string) =>
    `${protectedRoutesBase.invoices}/${id}/edit` as const,
} as const;

export const protectedRoutesArray = [
  ...Object.values(protectedRoutesBase),
] as const;

export const publicRoutesArray = [...Object.values(publicRoutes)] as const;

export const authRoutesArray = [...Object.values(authRoutes)] as const;

export const legalRoutesArray = [...Object.values(legalRoutes)] as const;

export const routes = {
  public: publicRoutesArray,
  protected: protectedRoutesArray,
  auth: authRoutesArray,
  legal: legalRoutesArray,
} as const;

// AC-05: deliberately-public static assets — crawling rules, sitemap, share-preview images,
// app icons and the manifest. Matched exactly (the icon family by pattern, since Next.js emits
// several sized/typed variants such as /icon.png, /icon.svg, /apple-icon.png).
const staticAssetRoutes = [
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
  '/opengraph-image',
  '/twitter-image',
  // F-26: the PWA icons app/manifest.json's `icons` array actually points at.
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
] as const;

// Next.js icon file conventions only: /icon, /icon.png, /icon1.svg, /icon/0, /apple-icon.png.
// Not a bare prefix, so a later page such as /iconography stays private.
const iconPathPattern = /^\/(apple-)?icon\d*(\.[a-z]+|\/[\w-]+)?$/;

// T09 (ADR-0002): a server component can't write cookies, so anything that finds a token
// without a live account redirects here (a route handler, which can) to clear the session
// cookie before sign-in; redirecting straight to sign-in would loop through the proxy.
export const CLEAR_SESSION_PATH = '/api/auth/clear-session';

// T15 (ADR-0007): Vercel Cron carries no session; the route guards itself with CRON_SECRET.
export const PURGE_LIMITS_CRON_PATH = '/api/cron/purge-limits';

// F-25: the next-auth (Auth.js v5) handler's own endpoints, listed explicitly instead of the
// whole `/api/auth/` prefix, so a route added under it later is private by default unless it is
// added here too. `/api/auth` itself is the base path the client SDK checks; signin/callback
// carry a dynamic `:provider` segment.
const nextAuthStaticPaths = [
  '/api/auth',
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/auth/error',
  '/api/auth/verify-request',
  // This app's own route, not next-auth's, but it must stay public the same way (both a
  // signed-in and a signed-out caller need to reach it — see its own file for why).
  CLEAR_SESSION_PATH,
] as const;

// Auth.js's only two endpoints that carry a dynamic provider segment.
const nextAuthProviderPathPattern = /^\/api\/auth\/(signin|callback)\/[\w-]+$/;

/**
 * AC-05: deny-by-default allowlist. Everything not covered here — including paths added
 * later — is private and requires a session.
 */
export function isPublicPath(pathname: string): boolean {
  if (
    publicRoutesArray.some((route) => pathname === route) ||
    authRoutesArray.some((route) => pathname === route) ||
    legalRoutesArray.some((route) => pathname === route) ||
    staticAssetRoutes.some((route) => pathname === route) ||
    nextAuthStaticPaths.some((route) => pathname === route) ||
    pathname === PURGE_LIMITS_CRON_PATH
  ) {
    return true;
  }

  if (iconPathPattern.test(pathname)) {
    return true;
  }

  return nextAuthProviderPathPattern.test(pathname);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * ADR-0003 layer 1: without a verified session, only safe methods may pass the edge. The
 * exceptions are deliberate: the sign-in service (`/api/auth/*`, governed by ADR-0001) and
 * POSTs to the sign-in page, where the sign-in actions are posted (any other action posted
 * there refuses itself with UNAUTHORIZED). A future public non-GET endpoint must be added here.
 */
export function isRefusedAnonymousMutation(method: string, pathname: string): boolean {
  const upper = method.toUpperCase();
  if (SAFE_METHODS.has(upper)) return false;
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) return false;
  if (upper === 'POST' && pathname === authRoutes.signIn) return false;
  return true;
}
