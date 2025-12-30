import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

// Edge-safe config (used by middleware). Do NOT import Node-only code here (e.g. Prisma, Nodemailer).
export default {
  providers: [Google],
} satisfies NextAuthConfig;
