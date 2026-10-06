// AC-02, AC-05: a session issued by the real sign-in flow, never a hand-built
// cookie. The helper drives /login like a Freelancer (accept the age/terms gate, enter the
// address, submit), then opens the Sign-in link the app mailed.
//   - Local run: the app mails through its real TLS-only transport to the e2e mail sink
//     (start-app-server.mjs / mail-sink.mjs); the link is read from the sink's inbox.
//   - Preview run (BASE_URL set): the link arrives in a real mailbox; paste it into the file named
//     by E2E_SIGNIN_LINK_FILE while the helper waits (see ship-notes.md).
import fs from 'node:fs';
import { expect, type Page } from '@playwright/test';
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

/** Signs `email` in through /login and the mailed Sign-in link; leaves `page` on a private page. */
export async function signInWithSignInLink(
  page: Page,
  email: string
): Promise<void> {
  if (process.env.E2E_SIGNIN_LINK_FILE)
    fs.rmSync(process.env.E2E_SIGNIN_LINK_FILE, { force: true });
  const requestedAt = Date.now();

  await page.goto(`${APP_E2E_URL}/login`);
  await page.getByRole('checkbox').click();
  await page.locator('#login-email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/verify-request**');

  const link = await waitForLink(email, requestedAt);
  await page.goto(link);
  await expect(
    page,
    'the Sign-in link must land on a private page'
  ).not.toHaveURL(/\/(login|error|verify-request)/);
}
