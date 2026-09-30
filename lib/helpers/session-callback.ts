// Extracted from auth.ts's NextAuth `callbacks.session` (T09/ADR-0002, review-2026-09-27 F-11)
// so it can be driven directly, against a real database, without importing 'next-auth' itself
// (which pulls in Next.js's own request machinery and can't be imported outside a served app —
// tests/integration/auth-session-callback.test.ts). Kept dependency-free of next-auth's own
// types: the shapes below are the minimal subset auth.ts's session strategy ('jwt') actually
// hands this callback.
//
// Behaviour (unchanged from the inline callback this replaces): a token whose `id` names a User
// row that no longer exists (the account was deleted, AC-21) leaves `session.user` untouched —
// no id, name, email or image is attached, so downstream code that only trusts `session.user.id`
// treats the caller as signed out.
import { prisma } from '@/prisma';

export type SessionCallbackSession = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires: string;
};

export type SessionCallbackToken = { id?: unknown };

export async function sessionCallback({
  session,
  token,
}: {
  session: SessionCallbackSession;
  token: SessionCallbackToken;
}): Promise<SessionCallbackSession> {
  if (!session.user || !token.id) {
    return session;
  }

  const user = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  if (user) {
    session.user.id = user.id;
    session.user.name = user.name || '';
    session.user.email = user.email;
    session.user.image = user.image || '';
  }

  return session;
}
