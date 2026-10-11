// @vitest-environment jsdom
// editor-ux T37 (AC-16): the one theme switcher behaves the same on the landing page and in the
// signed-in header: same accessible name, same options, same setTheme values.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme, theme: 'light' }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/ui/sidebar', () => ({ SidebarTrigger: () => null }));

import { LandingNav } from '@/components/landing/landing-nav';
import { SiteHeader } from '@/components/layout/site-header';

const sites = [
  ['landing header', () => <LandingNav brandName="Acme" />],
  ['signed-in header', () => <SiteHeader />],
] as const;

async function exercise(ui: React.ReactElement) {
  const user = userEvent.setup();
  render(ui);
  const trigger = screen.getAllByRole('button', { name: 'Toggle theme' })[0];
  await user.click(trigger);
  const options = (await screen.findAllByRole('menuitem')).map((o) =>
    o.textContent?.trim()
  );
  const dark = (await screen.findAllByRole('menuitem')).find((o) =>
    /dark/i.test(o.textContent ?? '')
  )!;
  await user.click(dark);
  const calls = setTheme.mock.calls.map((c) => c[0]);
  cleanup();
  return { name: trigger.textContent, options, calls };
}

describe('theme switcher in both headers (AC-16)', () => {
  beforeEach(() => setTheme.mockClear());

  it.each(sites)('%s exposes a "Toggle theme" button with light/dark/system', async (_n, make) => {
    const result = await exercise(make());
    expect(result.options.map((o) => o?.toLowerCase())).toEqual(['light', 'dark', 'system']);
    expect(result.calls).toEqual(['dark']);
  });

  it('landing and signed-in headers behave identically', async () => {
    const landing = await exercise(sites[0][1]());
    setTheme.mockClear();
    const app = await exercise(sites[1][1]());
    expect(app).toEqual(landing);
  });
});
