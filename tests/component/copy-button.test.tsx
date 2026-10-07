// @vitest-environment jsdom
// T20 — CopyButton: copied state, clipboard-unavailable state.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));

import { CopyButton } from '@/components/ui/copy-button';

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  });
}

describe('CopyButton', () => {
  beforeEach(() => {
    toastError.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('writes the value, shows Copied for 2s, then reverts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyButton value="secret-value" what="key" />);
    const btn = screen.getByRole('button', { name: 'Copy key' });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(writeText).toHaveBeenCalledWith('secret-value');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Copied'
    );
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeTruthy();
  });

  it('two clicks within 2s keep Copied and write twice', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyButton value="v" what="prompt" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('toasts an error when the clipboard is unavailable', async () => {
    setClipboard(undefined);
    render(<CopyButton value="v" what="key" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(toastError).toHaveBeenCalledWith(
      "Couldn't copy. Select the text and copy it by hand."
    );
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeTruthy();
  });

  it('toasts an error when writeText rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('no')) });
    render(<CopyButton value="v" what="key" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeTruthy();
  });
});
