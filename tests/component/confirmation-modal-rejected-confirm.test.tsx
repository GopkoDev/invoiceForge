// @vitest-environment jsdom
// T42 (review-2026-09-28 N-13, AC-21): a rejected async onConfirm must clear the busy state and
// send the device to sign-in instead of being swallowed.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { ConfirmationModal } =
  await import('@/components/modals/global-modals/confirmation-modal/confirmation-modal');

const assignMock = vi.fn();

describe('ConfirmationModal rejected onConfirm (N-13)', () => {
  beforeEach(() => {
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  it('routes to sign-in and re-enables the buttons', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationModal
        open
        onClose={vi.fn()}
        onConfirm={() => Promise.reject(new Error('401'))}
        title="Delete"
        description="Sure?"
        confirmText="Yes"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled()
    );
  });
});
