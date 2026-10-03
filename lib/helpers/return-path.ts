// T32 (review-2026-10-03-rereview R-04, AC-04): the "Try again" target on the clear-session
// route's check-unavailable page. The value comes from the query string or the Referer, both of
// which a cross-site link controls, so only a same-origin relative path is ever returned: no
// scheme, no protocol-relative `//host`, no backslash tricks, no control characters, and never an
// /api/ path (which would loop back into the route or hit a JSON endpoint).

/**
 * Returns `raw` reduced to a same-origin `pathname + search`, or null when it is not a safe
 * relative path. `allowAbsoluteSameOrigin` accepts a full URL on `origin` (a Referer header).
 */
export function safeReturnPath(
  raw: string | null | undefined,
  origin: string,
  { allowAbsoluteSameOrigin = false }: { allowAbsoluteSameOrigin?: boolean } = {}
): string | null {
  if (!raw) return null;
  // C0 controls, DEL and backslashes are never part of a path this app links to.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;

  const relative = raw.startsWith('/') && !raw.startsWith('//');
  if (!relative && !allowAbsoluteSameOrigin) return null;

  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;

  return `${url.pathname}${url.search}`;
}
