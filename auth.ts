import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/prisma';
import authConfig from '@/auth.config';
import Nodemailer from 'next-auth/providers/nodemailer';
import { getEmailServerConfig } from './lib/get-email-server-config';
import type { Adapter } from 'next-auth/adapters';
import { jwtConfig } from './config/jwt.config';
import { authRoutes } from './config/routes.config';

const emailServer = getEmailServerConfig();
const emailFrom = process.env.EMAIL_FROM;

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
        token.name = user.name;
        token.email = user.email;
        token.image = user.image;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.image = token.image as string;
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
