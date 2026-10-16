// @vitest-environment jsdom
// T04 (landing-update; AC-02, AC-03, AC-09) - LandingDemo: client player (phase machine, play-once, Replay, links, sr text).
// Seam: components/landing/landing-demo/landing-demo.tsx -> export function LandingDemo({ sample }: { sample: LandingDemoSample })
// Contract assumed:
//   - root element carries data-phase = idle | typing | thinking | card | done (T05 adds still)
//   - IntersectionObserver created with threshold 0.5; starts on an entry with isIntersecting && intersectionRatio >= 0.5
//   - decorative layer is [aria-hidden="true"] with no focusable element; two sibling links to authRoutes.signIn live outside it
//   - Replay is <button type="button"> named sample.replayLabel, rendered only at phase done
//   - sr-only text equals sample.srSummary
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
});

afterEach(() => {
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
