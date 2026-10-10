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

/**
 * WebKit treats http://127.0.0.1 as an insecure origin, so the production CSP's
 * `upgrade-insecure-requests` sends every sub-resource to https://127.0.0.1, where nothing
 * listens: the page loads unstyled and without scripts. WebKit also honours the app's
 * `Strict-Transport-Security` over plain http, with the same result from the next load on. Page
 * documents are re-served without those two (WebKit only; the policy under test in csp-gate is
 * untouched). A redirect is followed here and the browser's address is set to where it ended
 * (WebKit does not route a redirect's target itself).
 */
export async function allowPlainHttpOnWebKit(
  browser: Browser,
  context: BrowserContext
): Promise<void> {
  if (browser.browserType().name() !== 'webkit') return;
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers['content-length'];
    delete headers['content-encoding'];
    delete headers['strict-transport-security'];
    const csp = headers['content-security-policy'];
    if (csp) {
      headers['content-security-policy'] = csp
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d !== 'upgrade-insecure-requests')
        .join('; ');
    }
    let body = await response.text();
    if (response.url() !== request.url()) {
      const target = new URL(response.url());
      body = `<script>history.replaceState(null,'',${JSON.stringify(
        target.pathname + target.search
      )})</script>${body}`;
    }
    await route.fulfill({ status: response.status(), headers, body });
  });
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
  await allowPlainHttpOnWebKit(browser, context);
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
