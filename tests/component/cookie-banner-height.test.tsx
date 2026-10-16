// @vitest-environment jsdom
// ai-chat-v2 T30 finding (AC-15: "the message box stays visible at the bottom"): the cookie banner is a fixed
// overlay at the bottom of the viewport. The full-height AI section docks its composer at the very bottom, so while
// the banner shows it would cover the Send button. The banner publishes its height as --cookie-banner-height on
// <html>, and removes it when accepted, so a full-height layout can leave that space free.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CookieBanner } from '@/components/layout/cookie-banner';

const root = () => document.documentElement.style.getPropertyValue('--cookie-banner-height');

describe('CookieBanner publishes its height for full-height layouts', () => {
  let observed: ResizeObserverCallback | undefined;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--cookie-banner-height');
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          observed = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 57 } as DOMRect);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observed = undefined;
  });

  async function shown() {
    render(<CookieBanner />);
    await act(async () => {
      await Promise.resolve();
    });
    await screen.findByRole('button', { name: 'Accept' });
  }

  it('sets --cookie-banner-height to the banner height while it shows', async () => {
    await shown();
    expect(root()).toBe('57px');
  });

  it('follows a change in the banner height', async () => {
    await shown();
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ height: 96 } as DOMRect);
    act(() => observed?.([], {} as ResizeObserver));
    expect(root()).toBe('96px');
  });

  it('removes the variable once the cookies are accepted', async () => {
    await shown();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(root()).toBe('');
  });

  it('never sets it when consent was already given', async () => {
    localStorage.setItem('cookie-consent', 'true');
    render(<CookieBanner />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(root()).toBe('');
  });
});
