import 'server-only';

/**
 * ai-chat-v2 T37: the signed-in account's name for the AI section's greeting, or null. Presentation only: a failure
 * to read it never fails the page (the greeting then has no name). Lazy, like session-actor, so loading this module
 * needs no auth or database configuration.
 */
export async function sessionAccountName(): Promise<string | null> {
  try {
    const { auth } = await import('@/auth');
    const session = await auth();
    return session?.user?.name || null;
  } catch {
    return null;
  }
}
