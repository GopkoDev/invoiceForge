// @vitest-environment jsdom
// T25 (ai-chat-v2; AC-28, screens.md §SCR-08): the "AI" group renders like "Management" (a group label) and marks
// the item of the current page active.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

let pathname = '/ai';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

import { DynamicSidebarSection } from '@/components/layout/dynamic-sidebar-section';
import { SidebarProvider } from '@/components/ui/sidebar';
import { navigationMenuConfig } from '@/config/navigation-menu.config';

const sections = navigationMenuConfig.sections!;
const aiGroup = sections.find((s) => s.label === 'AI')!;
const management = sections.find((s) => s.label === 'Management')!;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderGroups() {
  return render(
    <SidebarProvider>
      <DynamicSidebarSection section={aiGroup} />
      <DynamicSidebarSection section={management} />
    </SidebarProvider>
  );
}
const isActive = (link: HTMLElement) =>
  (link.querySelector('[data-active="true"]') ?? link.closest('[data-active="true"]')) !== null;

describe('AppSidebar "AI" group (AC-28)', () => {
  it('shows the "AI" label styled like "Management" with its two items', () => {
    renderGroups();
    const ai = screen.getByText('AI', { selector: '[data-slot="sidebar-group-label"]' });
    const mgmt = screen.getByText('Management', { selector: '[data-slot="sidebar-group-label"]' });
    expect(ai.className).toBe(mgmt.className);
    expect(screen.getByRole('link', { name: 'AI chat' }).getAttribute('href')).toBe('/ai');
    expect(screen.getByRole('link', { name: 'Connect your AI' }).getAttribute('href')).toBe('/settings/assistants');
  });

  it.each(['/ai', '/ai/abc123'])('marks "AI chat" active on %s', (p) => {
    pathname = p;
    renderGroups();
    expect(isActive(screen.getByRole('link', { name: 'AI chat' }))).toBe(true);
    expect(isActive(screen.getByRole('link', { name: 'Connect your AI' }))).toBe(false);
  });

  it('marks "Connect your AI" active on /settings/assistants', () => {
    pathname = '/settings/assistants';
    renderGroups();
    expect(isActive(screen.getByRole('link', { name: 'Connect your AI' }))).toBe(true);
    expect(isActive(screen.getByRole('link', { name: 'AI chat' }))).toBe(false);
  });
});
