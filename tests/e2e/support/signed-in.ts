// A Freelancer with a seeded workspace and a genuine session (support/genuine-session.ts) in a
// browser context of its own, so each spec file's tests never share keys, limit windows or zones.
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
  TestInfo,
} from '@playwright/test';
import { createTestPrismaClient } from '../../support/db/client';
import { uniqueTestEmail } from '../../support/factories/ids';
import { readE2eRuntime } from './app-server';
import { signInWithSignInLink } from './genuine-session';
import { skipWithoutContainerRuntime } from './require-container-runtime';
import { seedWorkspace, type SeededWorkspace } from './seed';

export interface SignedInFreelancer {
  email: string;
  context: BrowserContext;
  page: Page;
  workspace: SeededWorkspace;
}

export async function openSignedInFreelancer(
  browser: Browser,
  testInfo: TestInfo,
  label: string,
  options: {
    seed?: Parameters<typeof seedWorkspace>[1];
    context?: BrowserContextOptions;
  } = {}
): Promise<SignedInFreelancer> {
  await skipWithoutContainerRuntime(testInfo);
  const email = uniqueTestEmail(label);
  const workspace = await seedWorkspace(email, options.seed);
  const context = await browser.newContext(options.context);
  const page = await context.newPage();
  await signInWithSignInLink(page, email);
  return { email, context, page, workspace };
}

/** The Freelancer's saved time zone, read straight from the throwaway database. */
export async function readSavedTimeZone(
  userId: string
): Promise<string | null> {
  const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });
    return user?.timeZone ?? null;
  } finally {
    await prisma.$disconnect();
  }
}
