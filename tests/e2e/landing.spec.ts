// landing-update T09 (spec.md §5 AC-01..04, 08..10, 11, 12; sad.md §10 QG-1..QG-3): browser-level
// behaviour of the landing page's first screen, demo player, fallbacks, sign-in links and metadata.
// T10 (same file): axe (AC-09), Linux visual references of the finished demo (AC-11), 30 KB JS budget (NFR).
// Runs against the production build (tests/e2e/support/start-app-server.mjs), Chromium project.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  type Browser,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';
import { APP_E2E_URL, SNAPSHOT_PLATFORM } from './support/app-server';
import { measureLandingJsSize } from './support/landing-js-size';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { openSignedInFreelancer } from './support/signed-in';
import { landingContent } from '../../constants/public-pages-content';
import {
  authRoutes,
  legalRoutes,
  protectedRoutes,
} from '../../config/routes.config';

const LANDING_URL = `${APP_E2E_URL}/`;
const { hero, demo, navigation, aiSection } = landingContent;

const VIEWPORTS = [
  { name: 'phone 360x640', size: { width: 360, height: 640 } },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 } },
] as const;

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutContainerRuntime(testInfo);
});

function demoRoot(page: Page): Locator {
  return page.locator('[data-phase]');
}

/** The landing's first h1 (the features and how-it-works sections carry their own h1s). */
function headline(page: Page): Locator {
  return page.locator('h1').first();
}

function heroSection(page: Page): Locator {
  return page.locator('section').filter({ hasText: hero.headline }).first();
}

function heroAccountLink(page: Page): Locator {
  return heroSection(page).getByRole('link', { name: hero.ctaButton });
}

async function openLanding(page: Page): Promise<void> {
  await page.goto(LANDING_URL);
  await expect(headline(page)).toBeVisible();
}

/** Waits for the player to take over (hydrated and armed). */
async function waitArmed(page: Page): Promise<void> {
  await expect(demoRoot(page)).toHaveAttribute('data-armed', '');
}

async function scrollDemoIntoView(page: Page): Promise<void> {
  await demoRoot(page).evaluate((el) =>
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
  );
}

/** Records every data-phase value from now on (the idle gap of a Replay lasts 300 ms: polling would miss it). */
async function recordPhases(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('[data-phase]')!;
    const w = window as unknown as { __phases: string[] };
    w.__phases = [el.getAttribute('data-phase') ?? ''];
    new MutationObserver(() => {
      const p = el.getAttribute('data-phase') ?? '';
      if (w.__phases[w.__phases.length - 1] !== p) w.__phases.push(p);
    }).observe(el, { attributes: true, attributeFilter: ['data-phase'] });
  });
}

async function phasesSeen(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __phases: string[] }).__phases
  );
}

async function demoBox(page: Page): Promise<{ width: number; height: number }> {
  const box = await demoRoot(page).boundingBox();
  if (!box) throw new Error('demo has no box');
  return { width: Math.round(box.width), height: Math.round(box.height) };
}

/**
 * True when the element and all its ancestors are fully opaque and not clipped away: Playwright
 * counts opacity:0 as visible, so the finished still is checked on the computed styles instead.
 */
async function isRevealed(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    let opacity = 1;
    for (let n: Element | null = el; n; n = n.parentElement) {
      opacity *= Number(getComputedStyle(n).opacity);
    }
    const clip = getComputedStyle(el).clipPath;
    const clipped =
      clip.startsWith('inset(') &&
      (clip.match(/[\d.]+/g) ?? []).some((n) => Number(n) !== 0);
    return opacity > 0.99 && !clipped;
  });
}

function sentenceBubble(page: Page): Locator {
  return page.getByText(demo.sentence, { exact: true });
}

function demoCustomer(page: Page): Locator {
  // the card inside the aria-hidden visual; the sr-only overlay link carries the same words
  return demoRoot(page)
    .locator('[aria-hidden="true"]')
    .getByText(demo.customer, { exact: true })
    .first();
}

async function expectFinishedStill(page: Page): Promise<void> {
  await expect.poll(() => isRevealed(sentenceBubble(page))).toBe(true);
  await expect.poll(() => isRevealed(demoCustomer(page))).toBe(true);
  await expect(
    demoRoot(page).getByText(demo.exampleLabel, { exact: true }).first()
  ).toBeVisible();
  await expect(demoRoot(page).getByText(demo.total).first()).toBeVisible();
}

/** The demo box of an ordinary run (JS on, motion allowed) after it finished, at the given viewport. */
async function normalDoneBox(
  browser: Browser,
  viewport: { width: number; height: number }
): Promise<{ width: number; height: number }> {
  // explicit overrides: browser.newContext inherits the calling describe's use() options
  const context = await browser.newContext({
    viewport,
    javaScriptEnabled: true,
    reducedMotion: 'no-preference',
  });
  try {
    const page = await context.newPage();
    await openLanding(page);
    await waitArmed(page);
    await scrollDemoIntoView(page);
    await expect(demoRoot(page)).toHaveAttribute('data-phase', 'done', {
      timeout: 8000,
    });
    return await demoBox(page);
  } finally {
    await context.close();
  }
}

for (const vp of VIEWPORTS) {
  test.describe(`landing @ ${vp.name}`, () => {
    test.use({ viewport: vp.size });

    test('AC-01: the promise, the supporting line and an account button above the fold, no stats row', async ({
      page,
    }) => {
      await openLanding(page);
      await expect(headline(page)).toHaveText(hero.headline);
      await expect(page.getByText(hero.supportingLine)).toBeVisible();
      const link = heroAccountLink(page);
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box, 'account button box').not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.size.height);
      await expect(link).toBeInViewport({ ratio: 1 });

      const heroText = (await heroSection(page).innerText()) ?? '';
      expect(heroText).not.toMatch(/\b0%|\b100%|\bLive\b/);
    });

    test('AC-09 / AC-11: the headline is the first heading, the page does not scroll sideways, the text equivalent is present', async ({
      page,
    }) => {
      await openLanding(page);
      const firstHeading = page.locator('h1, h2, h3, h4, h5, h6').first();
      await expect(firstHeading).toHaveText(hero.headline);
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
      // the screen-reader text equivalent: example sentence and a summary of the draft
      await expect(page.getByText(demo.srSummary)).toHaveCount(1);
      await expect(page.locator('#ai')).toHaveCount(1);
    });

    test('AC-02: plays once at 50% visible, finishes within 8 s, does not restart on scroll-back, Replay plays again identically', async ({
      page,
    }) => {
      await openLanding(page);
      await waitArmed(page);
      const root = demoRoot(page);
      await recordPhases(page);

      if (vp.size.width < 600) {
        // below the fold on the phone: it waits for the viewer
        await page.waitForTimeout(800);
        await expect(root).toHaveAttribute('data-phase', 'idle');
      }

      const started = Date.now();
      await scrollDemoIntoView(page);
      await expect(root).toHaveAttribute('data-phase', 'done', {
        timeout: 8000,
      });
      expect(Date.now() - started).toBeLessThan(8000);

      // the finished card: customer, a line, total with currency, a Create control the demo never presses
      await expect(demoCustomer(page)).toBeVisible();
      await expect(
        root.getByText(demo.lines[0].description).first()
      ).toBeVisible();
      await expect(root.getByText(`${demo.total}`).first()).toBeVisible();
      await expect(root.getByText(demo.currency).first()).toBeVisible();
      await expect(
        root.getByText(demo.exampleLabel, { exact: true }).first()
      ).toBeVisible();
      await expect(page).toHaveURL(LANDING_URL);

      const firstText = await root.textContent();
      const firstBox = await demoBox(page);

      // scrolling away and back does not restart it
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      await scrollDemoIntoView(page);
      await page.waitForTimeout(1200);
      await expect(root).toHaveAttribute('data-phase', 'done');
      const phases = await phasesSeen(page);
      expect(
        phases.slice(phases.indexOf('done') + 1),
        'phases after done'
      ).toEqual([]);

      // Replay plays again from the start, with identical content and an unchanged box
      await page.getByRole('button', { name: demo.replayLabel }).click();
      await expect.poll(() => phasesSeen(page)).toContain('idle');
      await expect(root).toHaveAttribute('data-phase', 'done', {
        timeout: 8000,
      });
      expect(await root.textContent()).toBe(firstText);
      expect(await demoBox(page)).toEqual(firstBox);
      await expect(
        page.getByRole('button', { name: demo.replayLabel })
      ).toBeVisible();
    });

    test('AC-03 / QG-2: the landing page makes no data requests while the demo plays and replays', async ({
      page,
    }) => {
      const offenders: string[] = [];
      page.on('request', (request: Request) => {
        const url = new URL(request.url());
        const headers = request.headers();
        const type = request.resourceType();
        // /monitoring is the Sentry tunnel (error reports), /_vercel/* the analytics beacons: both site-wide
        if (
          url.pathname === '/monitoring' ||
          url.pathname.startsWith('/_vercel/')
        )
          return;
        if (url.pathname.startsWith('/api/'))
          offenders.push(`api ${request.method()} ${url.pathname}`);
        else if (headers['next-action'])
          offenders.push(`server action ${url.pathname}`);
        else if (request.method() !== 'GET')
          offenders.push(`${request.method()} ${url.pathname}`);
        else if (
          (type === 'fetch' || type === 'xhr') &&
          !headers['next-router-prefetch'] &&
          headers['rsc'] !== '1'
        )
          offenders.push(`${type} ${url.pathname}`);
      });
      await openLanding(page);
      await waitArmed(page);
      await scrollDemoIntoView(page);
      await expect(demoRoot(page)).toHaveAttribute('data-phase', 'done', {
        timeout: 8000,
      });
      await page.getByRole('button', { name: demo.replayLabel }).click();
      await expect(demoRoot(page)).toHaveAttribute('data-phase', 'done', {
        timeout: 8000,
      });
      await page.waitForTimeout(500);
      expect(offenders).toEqual([]);
      await expect(page).toHaveURL(LANDING_URL);
    });

    test('AC-03 / AC-08: the account button, the demo card and Create lead to sign-in, also while the demo is typing', async ({
      page,
    }) => {
      await openLanding(page);
      await heroAccountLink(page).click();
      await expect(page).toHaveURL(new RegExp(`${authRoutes.signIn}$`), {
        timeout: 15_000,
      });

      for (const name of [demo.customer, demo.createLabel]) {
        for (const moment of ['typing', 'done'] as const) {
          await openLanding(page);
          await waitArmed(page);
          await scrollDemoIntoView(page);
          await expect(demoRoot(page)).toHaveAttribute(
            'data-phase',
            moment === 'typing' ? /typing|thinking/ : 'done',
            {
              timeout: 8000,
            }
          );
          const link = demoRoot(page).getByRole('link', { name });
          await expect(link).toHaveAttribute('href', authRoutes.signIn);
          await link.click();
          await expect(page, `${name} at ${moment}`).toHaveURL(
            new RegExp(`${authRoutes.signIn}$`),
            { timeout: 15_000 }
          );
        }
      }
    });

    test('AC-03: Replay only replays, it does not navigate', async ({
      page,
    }) => {
      await openLanding(page);
      await waitArmed(page);
      await scrollDemoIntoView(page);
      await expect(demoRoot(page)).toHaveAttribute('data-phase', 'done', {
        timeout: 8000,
      });
      await recordPhases(page);
      await page.getByRole('button', { name: demo.replayLabel }).click();
      await expect.poll(() => phasesSeen(page)).toContain('idle');
      await expect(page).toHaveURL(LANDING_URL);
    });

    test('AC-09: keyboard reaches the account button, the demo card, Create and Replay with visible focus, and leaves the demo', async ({
      page,
    }) => {
      await openLanding(page);
      await waitArmed(page);
      await scrollDemoIntoView(page);
      await expect(demoRoot(page)).toHaveAttribute('data-phase', 'done', {
        timeout: 8000,
      });

      const account = heroAccountLink(page);
      const card = demoRoot(page).getByRole('link', { name: demo.customer });
      const create = demoRoot(page).getByRole('link', {
        name: demo.createLabel,
      });
      const replay = page.getByRole('button', { name: demo.replayLabel });
      const focusVisible = (l: Locator) =>
        l.evaluate((el) => el.matches(':focus-visible'));

      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur()
      );
      await account.focus();
      await page.keyboard.press('Tab');
      await expect(card).toBeFocused();
      expect(await focusVisible(card)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(create).toBeFocused();
      expect(await focusVisible(create)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(replay).toBeFocused();
      expect(await focusVisible(replay)).toBe(true);
      // focus is not trapped
      await page.keyboard.press('Tab');
      const stillInside = await demoRoot(page).evaluate((el) =>
        el.contains(document.activeElement)
      );
      expect(stillInside).toBe(false);
      // Replay works from the keyboard
      await recordPhases(page);
      await replay.focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => phasesSeen(page)).toContain('idle');
    });
  });
}

test.describe('landing @ desktop navigation', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('AC-08: the AI navigation link jumps to the AI section, whose button leads to sign-in; the privacy link goes to /privacy', async ({
    page,
  }) => {
    await openLanding(page);
    const navLabel = navigation.links.find((l) => l.href === '#ai')!.label;
    await page.getByRole('link', { name: navLabel, exact: true }).click();
    await expect(page).toHaveURL(/#ai$/);
    const section = page.locator('#ai');
    await expect(section).toBeInViewport();
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(
      aiSection.h2
    );
    await expect(
      section.getByRole('link', { name: aiSection.privacyLink.label })
    ).toHaveAttribute('href', legalRoutes.privacy);
    await section.getByRole('link', { name: aiSection.ctaButton }).click();
    await expect(page).toHaveURL(new RegExp(`${authRoutes.signIn}$`), {
      timeout: 15_000,
    });
  });

  test('AC-08: the AI section button works directly and the privacy link opens /privacy', async ({
    page,
  }) => {
    await openLanding(page);
    await page
      .locator('#ai')
      .getByRole('link', { name: aiSection.privacyLink.label })
      .click();
    await expect(page).toHaveURL(new RegExp(`${legalRoutes.privacy}$`), {
      timeout: 15_000,
    });
  });
});

test.describe('landing @ phone AI section', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('AC-08: the AI section button leads to sign-in', async ({ page }) => {
    await openLanding(page);
    const button = page
      .locator('#ai')
      .getByRole('link', { name: aiSection.ctaButton });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(page).toHaveURL(new RegExp(`${authRoutes.signIn}$`), {
      timeout: 15_000,
    });
  });
});

for (const vp of VIEWPORTS) {
  test.describe(`landing demo fallbacks @ ${vp.name}`, () => {
    test.describe('reduced motion', () => {
      test.use({ viewport: vp.size, reducedMotion: 'reduce' });

      test('AC-04: the finished still shows at once, no Replay, same box', async ({
        page,
        browser,
      }) => {
        const reference = await normalDoneBox(browser, vp.size);
        await openLanding(page);
        await waitArmed(page);
        await expect(demoRoot(page)).toHaveAttribute('data-phase', 'still');
        await scrollDemoIntoView(page);
        await expectFinishedStill(page);
        await expect(
          page.getByRole('button', { name: demo.replayLabel })
        ).toHaveCount(0);
        expect(await demoBox(page)).toEqual(reference);
        await expect(headline(page)).toHaveText(hero.headline);
        await expect(heroAccountLink(page)).toHaveAttribute(
          'href',
          authRoutes.signIn
        );
      });
    });

    test.describe('scripts disabled', () => {
      test.use({ viewport: vp.size, javaScriptEnabled: false });

      test('AC-04: the noscript still shows the finished state, same box', async ({
        page,
        browser,
      }) => {
        const reference = await normalDoneBox(browser, vp.size);
        await page.goto(LANDING_URL);
        await expect(headline(page)).toHaveText(hero.headline);
        await expectFinishedStill(page);
        expect(await demoBox(page)).toEqual(reference);
        await expect(heroAccountLink(page)).toHaveAttribute(
          'href',
          authRoutes.signIn
        );
      });
    });

    test.describe('scripts never arrive', () => {
      test.use({ viewport: vp.size });

      test('AC-04: with every script request aborted the still shows 3 s after load, same box', async ({
        page,
        browser,
      }) => {
        const reference = await normalDoneBox(browser, vp.size);
        await page.route('**/*.js', (route) => route.abort());
        const navigatedAt = Date.now();
        await page.goto(LANDING_URL);
        await expect(headline(page)).toHaveText(hero.headline);
        await expect(demoRoot(page)).not.toHaveAttribute('data-armed', '');
        await expectFinishedStill(page);
        expect(
          Date.now() - navigatedAt,
          'ms from navigation to the still'
        ).toBeGreaterThanOrEqual(2500);
        expect(await demoBox(page)).toEqual(reference);
      });
    });

    test.describe('player held', () => {
      test.use({ viewport: vp.size });

      test('AC-04: armed but never started, the still shows 3 s after the demo is visible, same box', async ({
        page,
        browser,
      }) => {
        const reference = await normalDoneBox(browser, vp.size);
        await page.addInitScript(() => {
          (
            globalThis as { __LANDING_DEMO_HOLD__?: boolean }
          ).__LANDING_DEMO_HOLD__ = true;
          // when the player first flags the demo as visible (on desktop that is at load)
          document.addEventListener('DOMContentLoaded', () => {
            new MutationObserver(() => {
              const w = window as unknown as { __visibleAt?: number };
              if (
                w.__visibleAt === undefined &&
                document.querySelector('[data-visible]')
              )
                w.__visibleAt = performance.now();
            }).observe(document.documentElement, {
              subtree: true,
              attributes: true,
              attributeFilter: ['data-visible'],
            });
          });
        });
        await openLanding(page);
        await waitArmed(page);
        await scrollDemoIntoView(page);
        await expect(demoRoot(page)).toHaveAttribute('data-visible', '');
        const sinceVisible = () =>
          page.evaluate(
            () =>
              performance.now() -
              (window as unknown as { __visibleAt: number }).__visibleAt
          );
        // the held player never starts: the card stays unrevealed until 3 s after it became visible
        let revealedAfter = -1;
        const customer = demoCustomer(page);
        for (let i = 0; i < 60 && revealedAfter < 0; i++) {
          const before = await sinceVisible();
          if (await isRevealed(customer)) revealedAfter = before;
          else await page.waitForTimeout(100);
        }
        expect(revealedAfter, 'the still never appeared').toBeGreaterThan(0);
        expect(
          revealedAfter,
          'ms from visible to the still'
        ).toBeGreaterThanOrEqual(2500);
        await expect(demoRoot(page)).toHaveAttribute('data-phase', 'idle');
        await expectFinishedStill(page);
        expect(await demoBox(page)).toEqual(reference);
      });
    });
  });
}

test.describe('landing metadata', () => {
  test('AC-12: description, og:description and twitter:description mention one sentence and AI', async ({
    page,
  }) => {
    await page.goto(LANDING_URL);
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      const content = await page
        .locator(selector)
        .first()
        .getAttribute('content');
      expect(content, selector).toMatch(/one sentence/i);
      expect(content, selector).toMatch(/\bAI\b/);
      expect(content, selector).toMatch(/invoice draft/i);
    }
  });
});

test.describe('landing signed-in', () => {
  test('AC-10: a signed-in Freelancer opening / lands on the dashboard and never sees the new first screen', async ({
    browser,
  }, testInfo) => {
    const { context, page } = await openSignedInFreelancer(
      browser,
      testInfo,
      'landing-redirect'
    );
    try {
      await page.goto(LANDING_URL);
      await expect(page).toHaveURL(new RegExp(`${protectedRoutes.dashboard}`));
      await expect(page.getByText(hero.headline)).toHaveCount(0);
      await expect(page.locator('#ai')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

const SCHEMES = ['light', 'dark'] as const;

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test.describe(`landing axe + baselines @ ${vp.name} ${scheme}`, () => {
      test.use({ viewport: vp.size, colorScheme: scheme });

      test('AC-09: no serious or critical accessibility violations on the first screen', async ({
        page,
      }, testInfo) => {
        await openLanding(page);
        await waitArmed(page);
        await scrollDemoIntoView(page);
        await expect(demoRoot(page)).toHaveAttribute('data-phase', 'done', {
          timeout: 8000,
        });
        // a running fade would be measured half-transparent (false contrast findings)
        await page.waitForFunction(() =>
          document
            .getAnimations()
            .every(
              (a) =>
                a.playState !== 'running' ||
                a.effect?.getTiming().iterations === Infinity
            )
        );
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();
        const blocking = violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical'
        );
        for (const v of violations.filter((x) => !blocking.includes(x))) {
          testInfo.annotations.push({
            type: `axe-${v.impact ?? 'unknown'}`,
            description: `${v.id} on ${v.nodes.length} node(s) - ${v.help}`,
          });
        }
        expect(
          blocking.map(
            (v) =>
              `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} -> ${v.nodes
                .slice(0, 3)
                .map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`)
                .join(' | ')}`
          ),
          'serious or critical accessibility violations'
        ).toEqual([]);
      });

      test('AC-11: the first screen with the finished demo matches its Linux baseline', async ({
        page,
      }) => {
        test.skip(
          SNAPSHOT_PLATFORM !== 'linux',
          'Baselines are Linux-only (CI image); see tests/e2e/README.md'
        );
        await openLanding(page);
        await waitArmed(page);
        await scrollDemoIntoView(page);
        await expect(demoRoot(page)).toHaveAttribute('data-phase', 'done', {
          timeout: 8000,
        });
        await page.waitForTimeout(500);
        if (vp.size.width >= 600) {
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        await expect(page).toHaveScreenshot(
          `landing-${vp.size.width}x${vp.size.height}-${scheme}.png`,
          {
            maxDiffPixelRatio: 0.002,
            animations: 'disabled',
            // the cookie banner is client-only and fixed to the bottom edge
            mask: [page.locator('.fixed.right-0.bottom-0.left-0')],
          }
        );
      });
    });
  }
}

test.describe('landing JS budget', () => {
  test('NFR: the demo adds at most 30 KB of compressed JS to the first load', async ({
    browser,
  }) => {
    const budget = 30 * 1024;
    const landingJsBaseline = JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'tests/e2e/support/landing-js-baseline.json'),
        'utf8'
      )
    ) as { bytes: number };
    const now = await measureLandingJsSize(browser, APP_E2E_URL);
    const delta = now.bytes - landingJsBaseline.bytes;
    console.log(
      `landing first-load JS: now ${now.bytes} B, baseline ${landingJsBaseline.bytes} B, delta ${delta} B (budget ${budget} B)`
    );
    expect(
      delta,
      `JS delta ${delta} B (now ${now.bytes}, baseline ${landingJsBaseline.bytes}), budget ${budget}`
    ).toBeLessThanOrEqual(budget);
  });
});
