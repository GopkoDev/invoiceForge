// AC-07 (review 2026-10-10 T-e, bfcache part; ADR-0007): the back/forward cache path. Playwright
// launches Chromium with --disable-back-forward-cache, and its default headless shell turns the
// cache off as well (CDP reason "BackForwardCacheDisabledForDelegate"), so session-isolation.spec.ts
// can never see a restored page. This file runs the full Chromium build (new headless) with that
// flag dropped and proves first that a cacheable page IS restored (pageshow persisted=true). Then:
// (1) B goes Back to A's editor as the app serves it (no-store: not kept, so reloaded); (2) the
// same with Cache-Control dropped from every app response, so Chromium does restore A's editor and
// the restore guard (components/session-restore-guard.tsx) alone must keep A's invoice off screen.
// Note: with proxy.ts's header removed, Next.js still sends its own no-store on the dynamic editor,
// which is why (2) strips the header in the browser rather than relying on the proxy alone.
// The launch options apply to this file only (a worker of its own); every other spec is unchanged.
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Frame,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { signInWithSignInLink } from './support/genuine-session';
import { seedWorkspace } from './support/seed';
import { openEditor } from './support/invoice-ui';
import { APP_E2E_URL } from './support/app-server';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { uniqueTestEmail } from '../support/factories/ids';
import { legalRoutes } from '../../config/routes.config';

const CUSTOMER_A = 'Aardvark Bfcache Probe Ltd';

test.use({
  channel: 'chromium',
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});
test.describe.configure({ timeout: 300_000 });

interface Shown {
  path: string;
  persisted: boolean;
}

interface Watch {
  /** Every `pageshow` in the tab: which path, and whether it was a back/forward cache restore. */
  shows: Shown[];
  /** Paths of painted (not hidden) frames that showed one of the needles. */
  leaks: string[];
  /** Chromium's reasons for each Back/Forward that was not served from the cache. */
  notRestored: string[];
}

/**
 * The same instruments for the control and for the real run, so a restore the control sees is not
 * blocked by anything only the real run adds. The init script also lives on in a document the
 * cache restores, so its frame checks and `pageshow` listener keep running there.
 */
async function watch(
  context: BrowserContext,
  page: Page,
  needles: string[]
): Promise<Watch> {
  const w: Watch = { shows: [], leaks: [], notRestored: [] };
  await context.exposeFunction(
    '__reportShow',
    (path: string, persisted: boolean) => {
      w.shows.push({ path, persisted });
    }
  );
  await context.exposeFunction('__reportLeak', (path: string) => {
    w.leaks.push(path);
  });
  await context.addInitScript((needles: string[]) => {
    const report = window as unknown as {
      __reportShow: (p: string, persisted: boolean) => void;
      __reportLeak: (p: string) => void;
    };
    if (window === window.top) {
      addEventListener('pageshow', (e) =>
        report.__reportShow(location.pathname, e.persisted)
      );
    }
    const tick = () => {
      const hidden =
        document.documentElement.style.visibility === 'hidden' ||
        document.visibilityState === 'hidden';
      if (
        !hidden &&
        document.body &&
        needles.some((n) => document.body.innerText.includes(n))
      ) {
        report.__reportLeak(location.pathname);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, needles);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  cdp.on('Page.backForwardCacheNotUsed', (e) => {
    w.notRestored.push(
      `${e.notRestoredExplanationsTree?.url ?? '?'}: ${e.notRestoredExplanations
        .map((x) => x.reason)
        .join(', ')}`
    );
  });
  return w;
}

// The root layout's Vercel Analytics and Speed Insights each load a script once the page has
// hydrated. Locally the proxy redirects both to sign-in, so they end in a redirect or an error.
const ANALYTICS_SCRIPTS = [
  '/_vercel/insights/script.js',
  '/_vercel/speed-insights/script.js',
];
const AFTER_HYDRATION_WAIT_MS = 60_000;

function firstHop(request: Request): Request {
  let hop = request;
  for (let from = hop.redirectedFrom(); from; from = hop.redirectedFrom())
    hop = from;
  return hop;
}

/**
 * T53 (review r3 R3): resolves once the next document in `page` has hydrated and its
 * after-hydration requests (the two analytics scripts) have ended. Call it before the navigation.
 * A page left before that is evicted from the cache: a request still in flight is redirected
 * while the page is cached ("NetworkRequestRedirected"), or the page still runs hydration work
 * ("IgnoreEventAndEvict"). On a busy machine `load` comes a second or more before either.
 */
function afterHydrationRequestsEnded(page: Page): Promise<void> {
  const open = new Set(ANALYTICS_SCRIPTS);
  // Only the requests of the document the coming navigation commits, not of the one it leaves.
  let committed = false;
  const ours = new WeakSet<Request>();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(
        new Error(
          `the page never finished loading ${[...open].join(', ')} within ${AFTER_HYDRATION_WAIT_MS / 1000}s`
        )
      );
    }, AFTER_HYDRATION_WAIT_MS);
    const navigated = (frame: Frame) => {
      if (frame === page.mainFrame()) committed = true;
    };
    const started = (request: Request) => {
      if (committed && !request.redirectedFrom()) ours.add(request);
    };
    const ended = (request: Request, redirected: boolean) => {
      if (redirected) return; // the next hop is still on its way
      const first = firstHop(request);
      if (!ours.has(first)) return;
      open.delete(new URL(first.url()).pathname);
      if (open.size > 0) return;
      stop();
      resolve();
    };
    const finished = (request: Request) => {
      void request.response().then((response) => {
        const status = response?.status() ?? 0;
        ended(request, status >= 300 && status < 400);
      }, reject);
    };
    const failed = (request: Request) => ended(request, false);
    function stop() {
      clearTimeout(timer);
      page.off('framenavigated', navigated);
      page.off('request', started);
      page.off('requestfinished', finished);
      page.off('requestfailed', failed);
    }
    page.once('close', stop);
    page.on('framenavigated', navigated);
    page.on('request', started);
    page.on('requestfinished', finished);
    page.on('requestfailed', failed);
  });
}

/** Lets a painted frame of the current document be checked (and its report delivered). */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      )
  );
}

/**
 * Waits until the tab stops navigating: a restored page the guard reloads, or an auth page that
 * redirects a signed-in visitor, sets off more loads after the Back itself.
 */
async function settle(page: Page): Promise<void> {
  for (let hops = 0; hops < 10; hops++) {
    // Not waitForLoadState('load'): Playwright never sees a load for a restored document.
    await page
      .waitForFunction(() => document.readyState === 'complete', null, {
        timeout: 15_000,
      })
      .catch(() => undefined); // replaced mid-wait: go round
    const movedOn = await page
      .waitForEvent('framenavigated', {
        predicate: (frame) => frame === page.mainFrame(),
        timeout: 1_500,
      })
      .then(
        () => true,
        () => false
      );
    if (!movedOn) return;
  }
  throw new Error(`the tab never came to rest (at ${page.url()})`);
}

/** One Back press; resolves on commit, since a restored page fires no new load event. */
async function back(page: Page): Promise<void> {
  try {
    await page.goBack({ waitUntil: 'commit', timeout: 15_000 });
  } catch {
    // The entry moved on by itself: settle tells where we are.
  }
  await settle(page);
}

/** The control: a page that does not send no-store comes back from the cache in this browser. */
async function expectBfcacheLive(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const w = await watch(context, page, []);
    const privacySettled = afterHydrationRequestsEnded(page);
    privacySettled.catch(() => {}); // T56 (r4 P4): no unhandled rejection if a step before the await throws
    await page.goto(`${APP_E2E_URL}${legalRoutes.privacy}`);
    await privacySettled;
    expect(
      (await page.request.head(page.url())).headers()['cache-control'] ?? '',
      'the control page must be cacheable'
    ).not.toContain('no-store');
    await page.goto(`${APP_E2E_URL}${legalRoutes.terms}`);
    await back(page);
    await settleFrames(page);
    expect(
      w.shows.filter((s) => s.path === legalRoutes.privacy),
      `the back/forward cache is not live in this run (${w.notRestored.join(' | ')})`
    ).toEqual([
      { path: legalRoutes.privacy, persisted: false },
      { path: legalRoutes.privacy, persisted: true },
    ]);
  } finally {
    await context.close();
  }
}

/**
 * Signs out the way the app's Log out does (next-auth `signOut({ callbackUrl })` from the open
 * page: the CSRF-protected POST, then a full navigation to sign-in), so A's editor is the
 * document that is left — and kept by the cache, if anything keeps it.
 */
async function signOutFromPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { csrfToken } = await (await fetch('/api/auth/csrf')).json();
    const res = await fetch('/api/auth/signout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Auth-Return-Redirect': '1',
      },
      body: new URLSearchParams({ csrfToken, callbackUrl: '/login' }),
    });
    const { url } = (await res.json()) as { url?: string };
    location.href = url ?? '/login';
  });
  await page.waitForURL(/\/login/);
  await settle(page);
  const cookies = await page.context().cookies();
  expect(
    cookies.some((c) => /session-token/.test(c.name)),
    'signed out'
  ).toBe(false);
}

/**
 * A opens their editor, signs out, B signs in in the same tab and presses Back until A's editor
 * address comes up. No painted frame from the sign-out on may show A's invoice, and the page B
 * ends on is the server's answer for B. Returns what the tab saw, for the caller's own checks.
 */
async function backToAsEditor(
  browser: Browser,
  testInfo: TestInfo,
  label: string,
  prepare: (context: BrowserContext) => Promise<unknown> = async () => undefined
): Promise<{ w: Watch; editorPathA: string; editorCacheControl: string }> {
  const a = await openSignedInFreelancer(browser, testInfo, label, {
    seed: { customerName: CUSTOMER_A },
  });
  try {
    const { page, context } = a;
    await prepare(context);
    const number = a.workspace.invoiceNumber;
    const w = await watch(context, page, [number, CUSTOMER_A]);

    const editorSettled = afterHydrationRequestsEnded(page);
    editorSettled.catch(() => {}); // T56 (r4 P4): no unhandled rejection if a step before the await throws
    const editorDoc = page.waitForResponse(
      (r) =>
        r.request().resourceType() === 'document' && r.url().includes('/edit')
    );
    editorDoc.catch(() => {}); // T63 (r5 Q4a): same, if openEditor throws and the context closes
    await openEditor(page, a.workspace.invoiceId);
    const editorCacheControl =
      (await editorDoc).headers()['cache-control'] ?? '';
    await expect(page.locator('body')).toContainText(number);
    const editorPathA = new URL(page.url()).pathname;
    // A response still streaming into a cached page evicts it (NetworkExceedsBufferLimit); A
    // leaves an editor that has finished loading, so whether it is kept depends on the headers.
    await editorSettled;
    await page.waitForLoadState('networkidle');
    await settleFrames(page);

    await signOutFromPage(page);
    await settleFrames(page);
    // A's own frames before this point are expected; from here none may show A's data.
    const afterSignOut = w.leaks.length;

    const emailB = uniqueTestEmail(`${label}-b`);
    await seedWorkspace(emailB);
    await signInWithSignInLink(page, emailB);
    await settleFrames(page);

    let reached = false;
    for (let i = 0; i < 10 && !reached && page.url() !== 'about:blank'; i++) {
      await back(page);
      reached = new URL(page.url()).pathname === editorPathA;
    }
    testInfo.annotations.push(
      {
        type: 'editor cache-control',
        description: editorCacheControl || '(none)',
      },
      { type: 'pageshow', description: JSON.stringify(w.shows) },
      {
        type: 'not restored',
        description: w.notRestored.join(' | ') || '(none)',
      }
    );
    expect(reached, "Back never reached A's editor address").toBe(true);
    await settleFrames(page);
    expect(
      w.leaks.slice(afterSignOut),
      "A's invoice was painted for B"
    ).toEqual([]);

    // The end state is the server's answer for B, not A's page.
    await expect(
      page.getByRole('heading', { name: 'Invoice Not Found' })
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(number);
    await expect(page.locator('body')).not.toContainText(CUSTOMER_A);
    await settleFrames(page);
    expect(
      w.leaks.slice(afterSignOut),
      "A's invoice was painted for B"
    ).toEqual([]);
    return { w, editorPathA, editorCacheControl };
  } finally {
    await a.context.close();
  }
}

test("AC-07: with the back/forward cache on, B pressing Back to A's editor never sees A's invoice", async ({
  browser,
}, testInfo) => {
  await skipWithoutContainerRuntime(testInfo);
  await expectBfcacheLive(browser);

  const { w, editorPathA, editorCacheControl } = await backToAsEditor(
    browser,
    testInfo,
    'bf-a'
  );
  // ADR-0007's first layer: the signed-in page is never kept.
  expect(editorCacheControl).toContain('no-store');
  expect(
    w.shows,
    `A's editor was restored from the cache although it is no-store (${w.notRestored.join(' | ')})`
  ).not.toContainEqual({ path: editorPathA, persisted: true });
});

test("AC-07: when A's editor IS restored from the cache (no-store ignored), the restore guard keeps A's invoice off screen", async ({
  browser,
}, testInfo) => {
  await skipWithoutContainerRuntime(testInfo);
  await expectBfcacheLive(browser);

  // ADR-0007's second layer on its own: a browser that keeps the page anyway (as Safari may) is
  // played here by dropping Cache-Control from every app response, so Chromium does restore A's
  // editor; the guard must hide it and reload before any frame shows A's invoice.
  const { w, editorPathA } = await backToAsEditor(
    browser,
    testInfo,
    'bf-g',
    (context) =>
      context.route(`${APP_E2E_URL}/**`, async (route) => {
        const response = await route.fetch({ maxRedirects: 0 });
        const headers = { ...response.headers() };
        delete headers['cache-control'];
        await route.fulfill({ response, headers });
      })
  );
  expect(
    w.shows.filter((s) => s.path === editorPathA),
    "A's editor was not restored, so the guard was never exercised"
  ).toContainEqual({ path: editorPathA, persisted: true });
});
