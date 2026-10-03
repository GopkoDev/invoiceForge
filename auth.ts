import NextAuth from 'next-auth';
import { headers } from 'next/headers';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/prisma';
import authConfig from '@/auth.config';
import Nodemailer from 'next-auth/providers/nodemailer';
import { getEmailServerConfig } from './lib/get-email-server-config';
import { createEmailProviderHooks } from './lib/auth/email-provider';
import type { Adapter } from 'next-auth/adapters';
import { jwtConfig } from './config/jwt.config';
import { authRoutes } from './config/routes.config';
import { siteConfig } from './config/site.config';
import { sessionCallback } from './lib/helpers/session-callback';

const emailHooks = createEmailProviderHooks();
const emailFrom = siteConfig.branding.emailFrom;

// Custom adapter that allows account linking with same email
function customAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma);

  return {
    ...baseAdapter,
    async createUser(user) {
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (existingUser) {
        return existingUser;
      }

      return baseAdapter.createUser!(user);
    },
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  // R-03: a Sign-in link request whose user lookup cannot reach the database ends in the AC-15
  // message (callbacks.signIn), not error=Configuration; every other lookup is untouched.
  adapter: emailHooks.guardAdapter(customAdapter()),
  session: {
    strategy: 'jwt',
    maxAge: jwtConfig.expiresIn,
  },
  providers: [
    ...authConfig.providers,
    Nodemailer({
      server: getEmailServerConfig(),
      from: emailFrom,
      normalizeIdentifier: emailHooks.normalizeIdentifier,
      sendVerificationRequest: emailHooks.sendVerificationRequest as never,
    }),
  ],
  pages: {
    signIn: authRoutes.signIn,
    verifyRequest: authRoutes.verifyRequest,
    error: authRoutes.error,
  },
  events: {
    // Log when accounts are linked
    async linkAccount({ user, account }) {
      console.log(
        '[auth] Account linked:',
        process.env.NODE_ENV !== 'production'
          ? {
              userId: user.id,
              provider: account.provider,
              email: user.email,
            }
          : ''
      );
    },
  },
  callbacks: {
    // F-18: the sign-in-email source limit runs here, before Auth.js writes a VerificationToken.
    // headers() is the incoming request's in both the route handler and the /login action.
    signIn: emailHooks.signInCallback(() => headers()),

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      return token;
    },

    // F-11: the actual lookup lives in lib/helpers/session-callback.ts, extracted so a test can
    // drive it directly against a real database without importing 'next-auth' itself. Cast: that
    // module is deliberately typed against the minimal shape it needs, not next-auth's own
    // (structurally compatible at runtime — JWT/Session are supersets of it).
    session: (params) =>
      sessionCallback(
        params as unknown as Parameters<typeof sessionCallback>[0]
      ),
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
});
