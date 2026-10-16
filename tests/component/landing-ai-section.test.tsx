// @vitest-environment jsdom
// T07 (landing-update; AC-06, AC-07, AC-08) - AiSection, its place after the hero, and the #ai nav link.
// Seam: components/landing/ai-section.tsx -> export function AiSection(props)
// Contract assumed:
//   props = landingContent.aiSection spread: { badge, h2, does, never, ownTools, smallPrint, privacyLink, ctaButton }
//   - root element id="ai"; one h2 (props.h2); three block titles as headings (h3);
//   - links: only privacyLink (href legalRoutes.privacy) and the account button (authRoutes.signIn);
//   - smallPrint is a non-heading element holding the only "MCP".
//   LandingPage renders <AiSection> directly after the hero and before the features; the main navigation
//   exposes an <a href="#ai"> (via navigation.links).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { authRoutes, legalRoutes } from '@/config/routes.config';
import { landingContent } from '@/constants/public-pages-content';
import { AiSection } from '@/components/landing/ai-section';
import { LandingPage } from '@/app/(public)/landing-page';

const ai = landingContent.aiSection;

function renderSection() {
  const Props = AiSection as unknown as (p: Record<string, unknown>) => React.ReactElement;
  return render(<Props {...ai} />);
}

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
  if (!window.matchMedia) {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }));
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AiSection (T07)', () => {
  it('AC-06: the section has id="ai" and the h2', () => {
    const { container } = renderSection();
    const section = container.querySelector('#ai');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByRole('heading', { level: 2 }).textContent).toBe(ai.h2);
  });

  it('AC-06: three blocks (does / never / ownTools) with their titles and items', () => {
    const { container } = renderSection();
    const section = container.querySelector('#ai') as HTMLElement;
    for (const block of [ai.does, ai.never, ai.ownTools]) {
      expect(within(section).getByRole('heading', { name: block.title })).toBeTruthy();
      for (const item of block.items) expect(section.textContent).toContain(item);
    }
    expect(section.querySelectorAll('h3')).toHaveLength(3);
  });

  it('AC-06: states plainly the never-issues, daily limit and no-training facts', () => {
    const { container } = renderSection();
    const text = container.textContent ?? '';
    expect(text).toMatch(/never issues or sends an invoice/i);
    expect(text).toMatch(/daily message limit/i);
    expect(text).toMatch(/not used to train/i);
  });

  it('AC-07: names exactly Claude Desktop, Claude Code and Cursor', () => {
    const { container } = renderSection();
    const text = container.textContent ?? '';
    for (const tool of ['Claude Desktop', 'Claude Code', 'Cursor']) expect(text).toContain(tool);
    const withoutKnown = text.replace(/Claude Desktop|Claude Code/g, '');
    expect(withoutKnown).not.toMatch(/Claude/);
    expect(text).not.toMatch(/ChatGPT|any AI tool|Claude on the web/i);
  });

  it('AC-07: the permission note is present', () => {
    const { container } = renderSection();
    expect(container.textContent).toMatch(/permission you choose/i);
  });

  it('AC-07: "MCP" appears once, in small print, never in a heading', () => {
    const { container } = renderSection();
    const section = container.querySelector('#ai') as HTMLElement;
    const text = section.textContent ?? '';
    expect(text.match(/MCP/g) ?? []).toHaveLength(1);
    for (const h of section.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      expect(h.textContent).not.toMatch(/MCP/);
    }
    const small = screen.getByText(ai.smallPrint);
    expect(small.closest('h1,h2,h3,h4,h5,h6')).toBeNull();
  });

  it('AC-06/AC-08: only links are the privacy link and the sign-in account button', () => {
    const { container } = renderSection();
    const section = container.querySelector('#ai') as HTMLElement;
    const links = Array.from(section.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href')).sort()).toEqual(
      [legalRoutes.privacy, authRoutes.signIn].sort()
    );
    expect(screen.getByRole('link', { name: ai.privacyLink.label }).getAttribute('href')).toBe(
      legalRoutes.privacy
    );
    expect(screen.getByRole('link', { name: ai.ctaButton }).getAttribute('href')).toBe(
      authRoutes.signIn
    );
  });
});

describe('LandingPage with AiSection (T07)', () => {
  it('AC-06: #ai comes right after the hero and before the features', () => {
    const { container } = render(<LandingPage />);
    const main = container.querySelector('main') as HTMLElement;
    const sections = Array.from(main.children);
    const h1Idx = sections.findIndex((el) => el.querySelector('h1'));
    const aiIdx = sections.findIndex((el) => el.id === 'ai');
    const featIdx = sections.findIndex((el) => el.id === 'features');
    expect(aiIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBe(h1Idx + 1);
    expect(featIdx).toBe(aiIdx + 1);
  });

  it('AC-08: the main navigation exposes a link to #ai', () => {
    render(<LandingPage />);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#ai');
  });

  it('AC-08: the AI section account button on the page goes to sign-in', () => {
    const { container } = render(<LandingPage />);
    const section = container.querySelector('#ai') as HTMLElement;
    expect(within(section).getByRole('link', { name: ai.ctaButton }).getAttribute('href')).toBe(
      authRoutes.signIn
    );
  });
});
