import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

// Edge-safe config (used by middleware). Do NOT import Node-only code here (e.g. Prisma, Nodemailer).
export default {
  providers: [Google],
  callbacks: {
    // Edge-safe: copy the JWT's account id into session.user.id so the proxy can apply
    // isVerifiedSession. The Node config (auth.ts) overrides this with the live-account lookup.
    session({ session, token }) {
      if (session.user && typeof token?.id === 'string') {
        session.user.id = token.id;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
