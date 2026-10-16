// T62 (ai-chat-v2; AC-43, ADR-0012): the allowlist of in-app paths a reply may link to, built from the route patterns
// of config/routes.config.ts. Anything else (absolute, protocol-relative, scheme, query, fragment, unknown path) is not
// an in-app path.
const ID = '[A-Za-z0-9_-]{1,64}';

const PATTERNS: readonly RegExp[] = [
  '/dashboard',
  '/invoices',
  `/invoices/${ID}/edit`,
  '/invoices/new',
  '/customers',
  `/customers/${ID}`,
  '/customers/new',
  '/products',
  `/products/${ID}/edit`,
  '/products/new',
  '/sender-profiles',
  `/sender-profiles/${ID}`,
  `/sender-profiles/${ID}/edit/bank-accounts`,
  '/settings/profile',
  '/settings/privacy',
  '/settings/assistants',
  '/ai',
  `/ai/${ID}`,
].map((p) => new RegExp(`^${p}$`));

/** True only for a relative path that matches one of this app's page address patterns. */
export function isInAppPath(href: string): boolean {
  return PATTERNS.some((re) => re.test(href));
}
