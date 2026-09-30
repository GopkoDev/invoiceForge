// @vitest-environment jsdom
// T42 (review-2026-09-28 N-15; AC-21): the editor's UNAUTHORIZED redirect must bypass its own
// beforeunload "Leave site?" guard, or choosing "Stay" leaves a signed-out device on the editor.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const assignMock = vi.fn();

function fireBeforeUnload(): BeforeUnloadEvent {
  const event = new Event('beforeunload', {
    cancelable: true,
  }) as BeforeUnloadEvent;
  window.dispatchEvent(event);
  return event;
}

describe('unsaved-changes beforeunload guard vs sign-in redirect (T42, N-15)', () => {
  beforeEach(() => {
    vi.resetModules();
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  it('prompts before an ordinary unload while changes are unsaved', async () => {
    const { useUnsavedChangesGuard } =
      await import('@/hooks/use-unsaved-changes-guard');
    renderHook(() => useUnsavedChangesGuard(true));
    expect(fireBeforeUnload().defaultPrevented).toBe(true);
  });

  it('does not prompt once the device is being sent to sign-in', async () => {
    const { useUnsavedChangesGuard } =
      await import('@/hooks/use-unsaved-changes-guard');
    const { goToSignIn } =
      await import('@/lib/helpers/client-session-redirect');
    renderHook(() => useUnsavedChangesGuard(true));
    goToSignIn();

    expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session');
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
