// T20 (spec.md §5 AC-20): collects every content-security-policy violation a browser context sees.
// A page-side `securitypolicyviolation` listener (registered with addInitScript, so it is in place
// before any page script runs, on every page and popup of the context) records into
// `window.__cspViolations` and also reports to Node through an exposed function, so a violation
// survives the navigation that follows it. CSP messages on the console are collected too.
import type { BrowserContext, ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';

export interface CspViolation {
  source: 'event' | 'console';
  directive: string;
  blockedUri: string;
  sourceFile: string;
  pageUrl: string;
  detail: string;
}

declare global {
  interface Window {
    __cspViolations?: unknown[];
    __cspReport?: (violation: unknown) => void;
  }
}

const CONSOLE_CSP_PATTERN =
  /content security policy|violates the following content security policy/i;

/** A violation raised by a browser extension in the user's own browser is not the app's. */
export function isExtensionViolation(
  violation: Pick<CspViolation, 'sourceFile' | 'blockedUri'>
): boolean {
  return (
    violation.sourceFile.startsWith('chrome-extension://') ||
    violation.blockedUri.startsWith('chrome-extension://')
  );
}

export interface CspCollector {
  /** Violations seen so far, extension noise excluded. */
  violations(): CspViolation[];
  /**
   * Resolves with `work`'s result, but fails at once, naming the flow, if a violation shows up
   * while waiting (a blocked request would otherwise surface only as a long timeout).
   */
  waitFor<T>(flow: string, work: Promise<T>): Promise<T>;
  /** Fails the test, naming the flow, when any violation was seen since the last call. */
  expectNone(flow: string): void;
}

export async function collectCspViolations(
  context: BrowserContext
): Promise<CspCollector> {
  const seen: CspViolation[] = [];
  let reported = 0;

  await context.exposeFunction('__cspReport', (violation: unknown) => {
    seen.push({
      source: 'event',
      ...(violation as Omit<CspViolation, 'source'>),
    });
  });

  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      const violation = {
        directive: event.effectiveDirective,
        blockedUri: event.blockedURI,
        sourceFile: event.sourceFile,
        pageUrl: location.href,
        detail: event.originalPolicy,
      };
      window.__cspViolations?.push(violation);
      window.__cspReport?.(violation);
    });
  });

  const onConsole = (message: ConsoleMessage) => {
    const text = message.text();
    if (!CONSOLE_CSP_PATTERN.test(text)) return;
    seen.push({
      source: 'console',
      directive: '',
      blockedUri: '',
      sourceFile: message.location().url,
      pageUrl: message.page()?.url() ?? '',
      detail: text.slice(0, 300),
    });
  };
  for (const page of context.pages()) page.on('console', onConsole);
  context.on('page', (page) => page.on('console', onConsole));

  const violations = () =>
    seen.filter((violation) => !isExtensionViolation(violation));
  const expectNone = (flow: string) => {
    const fresh = violations().slice(reported);
    reported = violations().length;
    expect(fresh, `${flow}: content-security-policy violations`).toEqual([]);
  };

  const waitFor = <T>(flow: string, work: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let settled = false;
      const watcher = setInterval(() => {
        if (violations().length <= reported) return;
        clearInterval(watcher);
        settled = true;
        try {
          expectNone(flow);
        } catch (error) {
          reject(error);
        }
      }, 100);
      work.then(
        (value) => {
          clearInterval(watcher);
          if (!settled) resolve(value);
        },
        (error) => {
          clearInterval(watcher);
          if (!settled) reject(error);
        }
      );
    });

  return {
    violations,
    waitFor,
    expectNone,
  };
}
