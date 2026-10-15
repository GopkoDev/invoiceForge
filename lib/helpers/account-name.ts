import 'server-only';

/**
 * ai-chat-v2 T37: the signed-in account's name for the AI section's greeting, or null. Presentation only: a failure
 * to read it never fails the page (the greeting then has no name). It shares the render's one session read with the
 * acting Freelancer (R16-9). Lazy, like session-actor, so loading this module
 * needs no auth or database configuration.
 */
export async function sessionAccountName(): Promise<string | null> {
  try {
    const { readSession } = await import('@/lib/helpers/session-read');
    const session = await readSession();
    return session?.user?.name || null;
  } catch {
    return null;
  }
}
