// AC-02, AC-05: a session issued by the real sign-in flow, never a hand-built
// cookie. The helper drives /login like a Freelancer (accept the age/terms gate, enter the
// address, submit), then opens the Sign-in link the app mailed.
//   - Local run: the app mails through its real TLS-only transport to the e2e mail sink
//     (start-app-server.mjs / mail-sink.mjs); the link is read from the sink's inbox.
//   - Preview run (BASE_URL set): the link arrives in a real mailbox; paste it into the file named
//     by E2E_SIGNIN_LINK_FILE while the helper waits (see ship-notes.md).
import fs from 'node:fs';
import { expect, type Page, type Request } from '@playwright/test';
import { APP_E2E_URL, readE2eRuntime } from './app-server';

const LINK_WAIT_MS = 120_000;
const CALLBACK_LINK =
  /https?:\/\/[^\s"'<>]+\/api\/auth\/callback\/nodemailer\?[^\s"'<>]+/;

/** Decodes a quoted-printable body (soft line breaks and =XX escapes). */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function linkFromMessage(raw: string, email: string): string | null {
  if (
    !raw.toLowerCase().includes(`to: ${email.toLowerCase()}`) &&
    !raw.toLowerCase().includes(`<${email.toLowerCase()}>`)
  ) {
    return null;
  }
  return decodeQuotedPrintable(raw).match(CALLBACK_LINK)?.[0] ?? null;
}

async function waitForLink(email: string, since: number): Promise<string> {
  const deadline = Date.now() + LINK_WAIT_MS;
  const linkFile = process.env.E2E_SIGNIN_LINK_FILE;
  while (Date.now() < deadline) {
    if (linkFile) {
      if (fs.existsSync(linkFile)) {
        const pasted = fs.readFileSync(linkFile, 'utf8').trim();
        if (pasted) return pasted;
      }
    } else {
      const { mailDir } = readE2eRuntime();
      const files = fs.existsSync(mailDir)
        ? fs.readdirSync(mailDir).sort().reverse()
        : [];
      for (const file of files) {
        if (Number(file.split('-')[0]) < since) continue;
        const link = linkFromMessage(
          fs.readFileSync(`${mailDir}/${file}`, 'utf8'),
          email
        );
        if (link) return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `No Sign-in link arrived for ${email} within ${LINK_WAIT_MS / 1000}s`
  );
}

/**
 * Signs `email` in through /login and the mailed Sign-in link; leaves `page` on a private page.
 * `from` is a private path to open first (AC-19): the proxy sends the visitor to /login with the
 * path as callbackUrl, and the sign-in then continues from there.
 */
export async function signInWithSignInLink(
  page: Page,
  email: string,
  options: { from?: string } = {}
): Promise<void> {
  if (process.env.E2E_SIGNIN_LINK_FILE)
    fs.rmSync(process.env.E2E_SIGNIN_LINK_FILE, { force: true });
  const requestedAt = Date.now();

  await page.goto(`${APP_E2E_URL}${options.from ?? '/login'}`);
  if (options.from) await page.waitForURL('**/login**');
  await page.locator('[data-slot="checkbox"]').click();
  await page.locator('#login-email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/verify-request**');

  const link = await waitForLink(email, requestedAt);
  const zoneRefresh = (await zoneCookieIsCurrent(page))
    ? Promise.resolve()
    : zoneRefreshSettled(page);
  await page.goto(link);
  await expect(
    page,
    'the Sign-in link must land on a private page'
  ).not.toHaveURL(/\/(login|error|verify-request)/);
  // The landing page finishes loading (and any redirect behind it settles) before the caller
  // navigates on.
  await page.waitForLoadState('networkidle');
  // T53 (review r3 R3): network idle can come before the landing page has hydrated on a busy
  // machine. The private layout's TimeZoneCookie then writes the `tz` cookie and calls
  // router.refresh() just as the caller's next page.goto starts. WebKit cancels that refresh
  // fetch ("Load failed"), and Next.js answers a failed RSC fetch with a full navigation to the
  // landing page, which interrupts the caller's goto ("interrupted by another navigation to
  // /dashboard"). So the sign-in is done only once that refresh has come back.
  await zoneRefresh;
}

/** The browser's zone is already in the `tz` cookie, so the landing page will not refresh. */
async function zoneCookieIsCurrent(page: Page): Promise<boolean> {
  const browserZone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const cookies = await page.context().cookies(APP_E2E_URL);
  return cookies.some((c) => c.name === 'tz' && c.value === browserZone);
}

const ZONE_REFRESH_WAIT_MS = 60_000;

/** A router.refresh() fetch: an RSC request that is neither a prefetch nor a server action. */
function isRouterRefresh(request: Request): boolean {
  const headers = request.headers();
  return (
    headers['rsc'] === '1' &&
    !headers['next-router-prefetch'] &&
    !headers['next-action']
  );
}

/**
 * Resolves once the landing page's time-zone refresh (components/time-zone-cookie.tsx) has
 * finished. If the fetch fails, Next.js loads the page again in full; that load is waited for.
 */
function zoneRefreshSettled(page: Page): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(
        new Error(
          `the landing page's time-zone refresh did not finish within ${ZONE_REFRESH_WAIT_MS / 1000}s`
        )
      );
    }, ZONE_REFRESH_WAIT_MS);
    const finished = (request: Request) => {
      if (!isRouterRefresh(request)) return;
      stop();
      resolve();
    };
    const failed = (request: Request) => {
      if (!isRouterRefresh(request)) return;
      stop();
      page.waitForEvent('load').then(() => resolve(), reject);
    };
    function stop() {
      clearTimeout(timer);
      page.off('requestfinished', finished);
      page.off('requestfailed', failed);
    }
    page.on('requestfinished', finished);
    page.on('requestfailed', failed);
  });
}
