// Moves the browser's wall clock (Date only) to `instant` and lets it keep running.
// Why not page.clock: on the production build, Playwright's page.clock (setFixedTime,
// setSystemTime and install+resume alike) fakes the timer/animation-frame primitives React's
// streamed Suspense reveal relies on, so a page such as /invoices stays on its loading skeleton
// (the real rows sit in a hidden <template>). A Date-only shift gives the same "browser clock is
// at 23:55 / 00:05" without touching timers. The server's clock cannot be moved either way.
import type { Page } from '@playwright/test';

export async function setBrowserClock(
  page: Page,
  instant: Date
): Promise<void> {
  const offset = instant.getTime() - Date.now();
  await page.addInitScript((shift: number) => {
    const RealDate = Date;
    class ShiftedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(RealDate.now() + shift);
        else super(...(args as [number]));
      }
      static now(): number {
        return RealDate.now() + shift;
      }
    }
    (globalThis as unknown as { Date: unknown }).Date = ShiftedDate;
  }, offset);
}
