// The single "signed in?" predicate (security-patch AC-04). Edge-safe: no imports.
// A session is verified only when it carries a non-empty string account id; an Auth.js
// error object or any other truthy non-session is a Visitor.
export function isVerifiedSession(
  session: unknown
): session is { user: { id: string } } {
  const id = (session as { user?: { id?: unknown } } | null | undefined)?.user
    ?.id;
  return typeof id === 'string' && id.length > 0;
}
