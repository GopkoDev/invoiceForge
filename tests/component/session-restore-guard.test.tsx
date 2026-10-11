// @vitest-environment jsdom
// AC-07 / ADR-0007: a page the browser restores from its back/forward cache (pageshow with
// persisted = true) is hidden and reloaded before it can show a previous Freelancer's data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SessionRestoreGuard } from '@/components/session-restore-guard';

function pageshow(persisted: boolean) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

describe('SessionRestoreGuard (AC-07)', () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    vi.stubGlobal('location', { ...window.location, reload });
    document.documentElement.style.visibility = '';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.visibility = '';
  });

  it('hides the document and reloads when the page is restored from the cache', () => {
    render(<SessionRestoreGuard />);
    pageshow(true);
    expect(document.documentElement.style.visibility).toBe('hidden');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves a normal page show alone', () => {
    render(<SessionRestoreGuard />);
    pageshow(false);
    expect(document.documentElement.style.visibility).toBe('');
    expect(reload).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const { unmount } = render(<SessionRestoreGuard />);
    unmount();
    pageshow(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
