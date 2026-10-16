// @vitest-environment jsdom
// T04 (landing-update; AC-02, AC-03, AC-09) - LandingDemo: client player (phase machine, play-once, Replay, links, sr text).
// Seam: components/landing/landing-demo/landing-demo.tsx -> export function LandingDemo({ sample }: { sample: LandingDemoSample })
// Contract assumed:
//   - root element carries data-phase = idle | typing | thinking | card | done (T05 adds still)
//   - IntersectionObserver created with threshold 0.5; starts on an entry with isIntersecting && intersectionRatio >= 0.5
//   - decorative layer is [aria-hidden="true"] with no focusable element; two sibling links to authRoutes.signIn live outside it
//   - Replay is <button type="button"> named sample.replayLabel, rendered only at phase done
//   - sr-only text equals sample.srSummary
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { authRoutes } from '@/config/routes.config';
import { landingContent } from '@/constants/public-pages-content';
import { LandingDemo } from '@/components/landing/landing-demo/landing-demo';

const sample = landingContent.demo;

type Cb = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let observers: Array<{ cb: Cb; options?: IntersectionObserverInit; disconnect: ReturnType<typeof vi.fn> }>;
let fetchSpy: ReturnType<typeof vi.fn>;

function intersect(ratio: number) {
  act(() => {
    for (const o of observers) {
      o.cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
    }
  });
}

function phase(container: HTMLElement) {
  return container.querySelector('[data-phase]')?.getAttribute('data-phase');
}

function renderDemo() {
  return render(<LandingDemo sample={sample} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  observers = [];
  class MockIO {
    disconnect = vi.fn();
    constructor(cb: Cb, options?: IntersectionObserverInit) {
      observers.push({ cb, options, disconnect: this.disconnect });
    }
    observe() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', MockIO);
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  // jsdom applies no module CSS and reports opacity 1; default to "CSS reveal not happened yet" (T12).
  stubCssReveal(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LandingDemo', () => {
  it('AC-02: observes with threshold 0.5 and does not start below half visible', () => {
    const { container } = renderDemo();
    expect(observers.length).toBeGreaterThan(0);
    expect([observers[0].options?.threshold].flat()).toContain(0.5);
    expect(phase(container)).toBe('idle');
    intersect(0.49);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(phase(container)).toBe('idle');
  });

  it('AC-02: plays once at >= 50% visible and reaches done within 8 s showing the finished card', () => {
    const { container } = renderDemo();
    intersect(0.5);
    expect(phase(container)).toBe('typing');
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(phase(container)).toBe('done');
    const text = container.textContent ?? '';
    expect(text).toContain(sample.customer);
    expect(text).toContain(sample.total);
    expect(text).toContain(sample.currency);
    expect(text).toContain(sample.createLabel);
    expect(text).toContain(sample.exampleLabel);
    expect(screen.getByRole('button', { name: sample.replayLabel })).toBeTruthy();
  });

  it('AC-02: Replay is shown only at done', () => {
    const { container } = renderDemo();
    expect(screen.queryByRole('button', { name: sample.replayLabel })).toBeNull();
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(phase(container)).not.toBe('done');
    expect(screen.queryByRole('button', { name: sample.replayLabel })).toBeNull();
  });

  it('AC-02: scrolling away and back does not restart the demo', () => {
    const { container } = renderDemo();
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(phase(container)).toBe('done');
    intersect(0);
    intersect(1);
    expect(phase(container)).toBe('done');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(phase(container)).toBe('done');
  });

  it('AC-02/AC-03: Replay restarts from idle with identical content and keeps focus on Replay', () => {
    const { container } = renderDemo();
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    const before = container.querySelector('[aria-hidden="true"]')?.textContent;
    const replay = screen.getByRole('button', { name: sample.replayLabel });
    replay.focus();
    fireEvent.click(replay);
    expect(phase(container)).toBe('idle');
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(phase(container)).toBe('done');
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(before);
    expect(before).toContain(sample.customer);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: sample.replayLabel }));
  });

  it('AC-03: card and Create are two links to sign-in, present in every phase', () => {
    const { container } = renderDemo();
    const check = () => {
      const links = screen.getAllByRole('link');
      expect(links.length).toBe(2);
      for (const l of links) expect(l.getAttribute('href')).toBe(authRoutes.signIn);
      expect(links[0].contains(links[1])).toBe(false);
      expect(links[1].contains(links[0])).toBe(false);
    };
    check();
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(phase(container)).not.toBe('idle');
    check();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    check();
  });

  it('AC-03: never calls fetch (idle, play, replay)', () => {
    renderDemo();
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    fireEvent.click(screen.getByRole('button', { name: sample.replayLabel }));
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('AC-09: sr-only text equivalent is present and outside aria-hidden', () => {
    const { container } = renderDemo();
    const el = screen.getByText(sample.srSummary);
    expect(el.closest('[aria-hidden="true"]')).toBeNull();
    expect(container.textContent).toContain(sample.sentence);
  });

  it('AC-09: no focusable element inside the aria-hidden layer; links stay outside it', () => {
    const { container } = renderDemo();
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
    for (const h of hidden) {
      expect(
        h.querySelectorAll('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]').length,
      ).toBe(0);
    }
    for (const a of screen.getAllByRole('link')) expect(a.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: sample.replayLabel }).closest('[aria-hidden="true"]')).toBeNull();
  });

  it('unmount mid-play disconnects the observer and clears timers', () => {
    const { unmount } = renderDemo();
    intersect(1);
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T05 (landing-update; AC-04) - finished-still fallbacks, armed/visible reveal timing, test hold flag.
// Contract assumed (new):
//   - on mount the player sets data-armed on the root (presence = armed; value not asserted)
//   - on >= 50% visible it sets data-visible on the root BEFORE starting the animation
//   - reduced motion (matchMedia('(prefers-reduced-motion: reduce)').matches) -> data-phase="still", no timers, no Replay
//   - late hydration = >= 3000 ms since performance.timeOrigin (via performance.now()):
//       first observer entry on screen (>= 0.5) -> "still" WITH Replay; off screen -> stays "idle", plays on visibility
//   - globalThis.__LANDING_DEMO_HOLD__ === true -> armed (+ visible) but never leaves "idle"
//   - the component renders <noscript><style> (checked via server render; React client does not render noscript)
// Limit: jsdom has no layout; "box size unchanged" is asserted as structure/class stability + CSS source,
// real pixel size and CSS-only reveal paths are e2e (T09).
const root = (c: HTMLElement) => c.querySelector('[data-phase]') as HTMLElement;

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matches && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })),
  );
}

function setSinceLoad(ms: number) {
  vi.spyOn(performance, 'now').mockReturnValue(ms);
  vi.setSystemTime(performance.timeOrigin + ms);
}

describe('LandingDemo AC-04 fallbacks', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__LANDING_DEMO_HOLD__;
    vi.restoreAllMocks();
  });

  it('AC-04: reduced motion -> finished still, armed, no Replay, no timers, never animates', () => {
    stubReducedMotion(true);
    const { container } = renderDemo();
    expect(root(container).getAttribute('data-phase')).toBe('still');
    expect(root(container).hasAttribute('data-armed')).toBe(true);
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(root(container).getAttribute('data-phase')).toBe('still');
    expect(screen.queryByRole('button', { name: sample.replayLabel })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('AC-04: the still carries the finished content (sentence, card, example label, both links)', () => {
    stubReducedMotion(true);
    const { container } = renderDemo();
    expect(root(container).getAttribute('data-phase')).toBe('still');
    const text = container.textContent ?? '';
    for (const t of [sample.sentence, sample.customer, sample.total, sample.exampleLabel, sample.createLabel]) {
      expect(text).toContain(t);
    }
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(2);
    for (const l of links) expect(l.getAttribute('href')).toBe(authRoutes.signIn);
  });

  it('AC-04: late hydration, demo on screen -> keeps the still and offers Replay', () => {
    stubReducedMotion(false);
    setSinceLoad(5000);
    stubCssReveal(true);
    const { container } = renderDemo();
    intersect(1);
    expect(root(container).getAttribute('data-phase')).toBe('still');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(root(container).getAttribute('data-phase')).toBe('still');
    expect(screen.getByRole('button', { name: sample.replayLabel })).toBeTruthy();
  });

  it('AC-04: late hydration, demo not on screen -> stays idle unseen, then plays on visibility', () => {
    stubReducedMotion(false);
    setSinceLoad(5000);
    stubCssReveal(true);
    const { container } = renderDemo();
    intersect(0);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(root(container).getAttribute('data-phase')).toBe('idle');
    expect(screen.queryByRole('button', { name: sample.replayLabel })).toBeNull();
    intersect(1);
    expect(root(container).getAttribute('data-phase')).toBe('typing');
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(root(container).getAttribute('data-phase')).toBe('done');
  });

  it('AC-04: early hydration on screen still animates (not the still)', () => {
    stubReducedMotion(false);
    setSinceLoad(500);
    const { container } = renderDemo();
    intersect(1);
    expect(root(container).getAttribute('data-phase')).toBe('typing');
  });

  it('AC-04: data-armed is set on mount, data-visible only once >= 50% visible, armed first', () => {
    stubReducedMotion(false);
    setSinceLoad(500);
    const { container } = renderDemo();
    const el = root(container);
    expect(el.hasAttribute('data-armed')).toBe(true);
    expect(el.hasAttribute('data-visible')).toBe(false);
    const mo = new MutationObserver(() => {});
    mo.observe(el, { attributes: true, attributeFilter: ['data-armed', 'data-visible', 'data-phase'] });
    intersect(0.4);
    expect(el.hasAttribute('data-visible')).toBe(false);
    intersect(0.5);
    expect(el.hasAttribute('data-visible')).toBe(true);
    expect(el.getAttribute('data-phase')).toBe('typing');
    const names = mo.takeRecords().map((r) => r.attributeName);
    mo.disconnect();
    // armed was already set before observing; visible must appear before the phase leaves idle.
    expect(names).toContain('data-visible');
    expect(names.indexOf('data-visible')).toBeLessThanOrEqual(names.indexOf('data-phase'));
  });

  it('AC-04: hold flag keeps the demo armed and idle even when visible', () => {
    stubReducedMotion(false);
    setSinceLoad(500);
    (globalThis as Record<string, unknown>).__LANDING_DEMO_HOLD__ = true;
    const { container } = renderDemo();
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const el = root(container);
    expect(el.getAttribute('data-phase')).toBe('idle');
    expect(el.hasAttribute('data-armed')).toBe(true);
    expect(el.hasAttribute('data-visible')).toBe(true);
  });

  it('AC-04: box size - frame/stage structure and classes identical in idle, done and still, no inline sizing', () => {
    const snapshot = (c: HTMLElement) => {
      const visual = c.querySelector('[aria-hidden="true"]') as HTMLElement;
      const all = [visual, ...Array.from(visual.querySelectorAll('*'))] as HTMLElement[];
      return all.map((n) => `${n.tagName}.${n.className}|${n.getAttribute('style') ?? ''}`).join('\n');
    };
    stubReducedMotion(false);
    setSinceLoad(500);
    const a = renderDemo();
    const idle = snapshot(a.container);
    intersect(1);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(root(a.container).getAttribute('data-phase')).toBe('done');
    expect(snapshot(a.container)).toBe(idle);
    a.unmount();
    stubReducedMotion(true);
    const b = renderDemo();
    expect(root(b.container).getAttribute('data-phase')).toBe('still');
    expect(snapshot(b.container)).toBe(idle);
    expect(idle).not.toMatch(/height|min-height/i);
  });

  it('AC-04: server HTML has the empty start frame plus a <noscript><style> finished-still fallback', () => {
    const html = renderToStaticMarkup(<LandingDemo sample={sample} />);
    expect(html).toMatch(/<noscript>[\s\S]*<style>[\s\S]*<\/style>[\s\S]*<\/noscript>/);
    expect(html).toContain('data-phase="idle"');
    expect(html).not.toContain('data-armed');
    expect(html).not.toContain(sample.replayLabel);
  });

  it('AC-04: CSS module declares the still via reduced-motion, data-phase=still and a 3s delayed reveal', () => {
    const css = readFileSync('components/landing/landing-demo/landing-demo.module.css', 'utf8');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/\[data-phase=["']?still["']?\]/);
    expect(css).toMatch(/\[data-phase=["']?idle["']?\]:not\(\[data-armed\]\)/);
    expect(css).toMatch(/\[data-armed\]\[data-visible\]/);
    expect(css).toMatch(/animation-delay:\s*3s/);
  });
});

// ---------------------------------------------------------------------------
// T12 (landing-update; AC-02, AC-04; review F1 + F2; ADR-0002) - hydration handoff.
// Lateness is judged from the CSS reveal state (computed opacity of the bubble), not performance.now().
const realGetComputedStyle = window.getComputedStyle.bind(window);
function stubCssReveal(revealed: boolean) {
  const real = realGetComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const style = real(el, pseudo);
    if (el instanceof HTMLElement && /bubble/.test(el.className)) {
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'opacity') return revealed ? '1' : '0';
          const v = Reflect.get(target, prop);
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    }
    return style;
  });
}

describe('LandingDemo T12 hydration handoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('F2/AC-04: without IntersectionObserver the demo ends in the finished still', () => {
    stubReducedMotion(false);
    setSinceLoad(500);
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = renderDemo();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(root(container).getAttribute('data-phase')).toBe('still');
  });

  it('F1a/AC-04: hydrating after the CSS reveal showed the still keeps it revealed in the same commit, before any observer callback', () => {
    stubReducedMotion(false);
    setSinceLoad(5000);
    stubCssReveal(true);
    const { container } = renderDemo();
    const el = root(container);
    expect(el.hasAttribute('data-armed')).toBe(true);
    const revealed =
      el.getAttribute('data-phase') === 'still' ||
      el.hasAttribute('data-visible') ||
      el.hasAttribute('data-late');
    expect(revealed, 'armed root matches no reveal selector before the observer fires').toBe(true);
  });

  it('F1b/AC-02: mounting at performance.now() >= 3000 while the CSS reveal has not happened, on screen, plays the animation', () => {
    stubReducedMotion(false);
    setSinceLoad(5000);
    stubCssReveal(false);
    const { container } = renderDemo();
    intersect(1);
    expect(root(container).getAttribute('data-phase')).toBe('typing');
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(root(container).getAttribute('data-phase')).toBe('done');
  });

  it('F1b/AC-04: mounting early while the CSS reveal already happened, on screen, keeps the still', () => {
    stubReducedMotion(false);
    setSinceLoad(500);
    stubCssReveal(true);
    const { container } = renderDemo();
    intersect(1);
    expect(root(container).getAttribute('data-phase')).toBe('still');
  });

  describe('F3/AC-02/AC-05: box-level Example label outside the draft card', () => {
    function outsideCard(container: HTMLElement) {
      const card = container.querySelector('[data-slot="card"]');
      expect(card).not.toBeNull();
      return Array.from(container.querySelectorAll('*')).filter(
        (el) =>
          el.children.length === 0 &&
          el.textContent === sample.exampleLabel &&
          !card!.contains(el) &&
          !el.closest('[class*="cardWrap"]'),
      );
    }

    it('shows the label outside the card while idle', () => {
      const { container } = renderDemo();
      expect(phase(container)).toBe('idle');
      expect(outsideCard(container).length).toBeGreaterThan(0);
    });

    it('keeps the label outside the card while typing and when done', () => {
      const { container } = renderDemo();
      intersect(1);
      expect(phase(container)).toBe('typing');
      expect(outsideCard(container).length).toBeGreaterThan(0);
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(phase(container)).toBe('done');
      expect(outsideCard(container).length).toBeGreaterThan(0);
    });
  });
});
