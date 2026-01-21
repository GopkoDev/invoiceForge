import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/prisma';
import authConfig from '@/auth.config';
import Nodemailer from 'next-auth/providers/nodemailer';
import { getEmailServerConfig } from './lib/get-email-server-config';
import type { Adapter } from 'next-auth/adapters';
import { jwtConfig } from './config/jwt.config';
import { authRoutes } from './config/routes.config';
import { siteConfig } from './config/site.config';

const emailServer = getEmailServerConfig();
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
  adapter: customAdapter(),
  session: {
    strategy: 'jwt',
    maxAge: jwtConfig.expiresIn,
  },
  providers: [
    ...authConfig.providers,
    Nodemailer({
      server: emailServer,
      from: emailFrom,
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
      console.log('[auth] Account linked:', {
        userId: user.id,
        provider: account.provider,
        email: user.email,
      });
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      return token;
    },

    async session({ session, token }) {
      if (token.id) {
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
      }

      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
});
