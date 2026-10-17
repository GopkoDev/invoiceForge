// @vitest-environment jsdom
// T06 (landing-update; AC-01, AC-09) - LandingHero rewritten around the one-sentence promise.
// Seam: components/landing/landing-hero.tsx -> export function LandingHero(props)
// Contract assumed:
//   props: { badge: { icon, text }, headline: string, supportingLine: string, ctaButton: string,
//            ctaHref?: string (default authRoutes.signIn), demo: LandingDemoSample }
//   - headline is the plain promise string (landingContent.hero.headline.text today; the implementer may
//     collapse hero.headline to that string - the test reads either shape).
//   - exactly one <h1> holding the promise; no stats row; <LandingDemo sample={demo} /> rendered inside.
//   - account link is an <a> named hero.ctaButton whose href is authRoutes.signIn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { authRoutes } from '@/config/routes.config';
import { landingContent } from '@/constants/public-pages-content';
import { LandingHero } from '@/components/landing/landing-hero';

const hero = landingContent.hero;
const demo = landingContent.demo;
// The implementer removes stats / line1 / line2 / subheadline from the content; these are the old values,
// read from content while they exist and pinned here so the "gone" assertions survive the removal.
const old = hero as unknown as {
  stats?: Array<{ label: string; value: string }>;
  subheadline?: string;
};
const oldStats = old.stats ?? [
  { label: 'Manual Retyping', value: '0%' },
  { label: 'Pixel-Perfect', value: '100%' },
  { label: 'Status Tracking', value: 'Live' },
];
const oldLines = ['Master Your Billing', 'With the Invoice Forge'];
const oldSubheadline = old.subheadline ?? 'Stop wrestling with messy templates.';
const headlineValue = hero.headline as unknown;
const promise =
  typeof headlineValue === 'string'
    ? headlineValue
    : (headlineValue as { text: string }).text;

function renderHero() {
  const Props = LandingHero as unknown as (p: Record<string, unknown>) => React.ReactElement;
  return render(
    <Props
      badge={hero.badge}
      headline={promise}
      supportingLine={hero.supportingLine}
      ctaButton={hero.ctaButton}
      demo={demo}
    />
  );
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LandingHero (T06)', () => {
  it('AC-01/AC-09: exactly one h1 and it is the one-sentence promise', () => {
    const { container } = renderHero();
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(promise);
    expect(promise).toMatch(/one sentence/i);
  });

  it('AC-09: the h1 is the first heading on the page', () => {
    const { container } = renderHero();
    const first = container.querySelector('h1, h2, h3, h4, h5, h6');
    expect(first?.tagName).toBe('H1');
  });

  it('AC-01: the supporting line is present', () => {
    renderHero();
    expect(screen.getByText(hero.supportingLine)).toBeTruthy();
  });

  it('AC-01: the account button links to the sign-in route', () => {
    renderHero();
    const link = screen.getByRole('link', { name: hero.ctaButton });
    expect(link.getAttribute('href')).toBe(authRoutes.signIn);
  });

  it('AC-01: the badge is kept', () => {
    renderHero();
    expect(screen.getByText(hero.badge.text)).toBeTruthy();
  });

  it('AC-01: the demo is rendered with a screen-reader text equivalent', () => {
    const { container } = renderHero();
    expect(container.querySelector('[data-phase]')).not.toBeNull();
    expect(screen.getByText(demo.srSummary)).toBeTruthy();
  });

  it('AC-01: the old row of three figures is gone', () => {
    const { container } = renderHero();
    for (const stat of oldStats) {
      expect(screen.queryByText(stat.value)).toBeNull();
      expect(screen.queryByText(stat.label)).toBeNull();
    }
    expect(container.textContent).not.toContain('0%');
    expect(container.textContent).not.toContain('100%');
  });

  it('AC-01: the old two-line headline and subheadline are not rendered', () => {
    const { container } = renderHero();
    for (const line of oldLines) expect(container.textContent).not.toContain(line);
    expect(container.textContent).not.toContain(oldSubheadline);
  });
});
