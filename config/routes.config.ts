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
] as const;

// Next.js icon file conventions only: /icon, /icon.png, /icon1.svg, /icon/0, /apple-icon.png.
// Not a bare prefix, so a later page such as /iconography stays private.
const iconPathPattern = /^\/(apple-)?icon\d*(\.[a-z]+|\/[\w-]+)?$/;

// The next-auth handler itself must stay reachable without a session (it is how a session is
// created in the first place).
const nextAuthApiPrefix = '/api/auth/';

/**
 * AC-05: deny-by-default allowlist. Everything not covered here — including paths added
 * later — is private and requires a session.
 */
export function isPublicPath(pathname: string): boolean {
  if (
    publicRoutesArray.some((route) => pathname === route) ||
    authRoutesArray.some((route) => pathname === route) ||
    legalRoutesArray.some((route) => pathname === route) ||
    staticAssetRoutes.some((route) => pathname === route)
  ) {
    return true;
  }

  if (iconPathPattern.test(pathname)) {
    return true;
  }

  return pathname === '/api/auth' || pathname.startsWith(nextAuthApiPrefix);
}
