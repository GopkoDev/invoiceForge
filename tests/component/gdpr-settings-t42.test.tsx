// @vitest-environment jsdom
// T42 (review-2026-09-28 N-04, N-09, N-12, N-14; AC-20, AC-21) — SCR-08 delete-account dialog:
// UNAUTHORIZED and rejected calls go to sign-in, the dialog state resets on open, and a signOut
// failure after a successful delete never claims "Nothing was removed".
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';

const getSummaryMock = vi.fn();
const deleteMock = vi.fn();
vi.mock('@/lib/actions/account-actions', () => ({
  getAccountDeletionSummary: (...a: unknown[]) => getSummaryMock(...a),
  deleteUserAccount: (...a: unknown[]) => deleteMock(...a),
}));

const signOutMock = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (...a: unknown[]) => signOutMock(...a),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

const { GdprSettings } = await import('@/components/settings/gdpr-settings');
const { SettingsModalContainer } =
  await import('@/components/modals/settings/settings-modal-container');
const { useModalStore } = await import('@/store/use-modal-store');

const assignMock = vi.fn();

function renderSettings() {
  return render(
    <>
      <GdprSettings />
      <SettingsModalContainer />
    </>
  );
}

const openDialog = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /delete account/i }));

describe('GdprSettings T42', () => {
  beforeEach(() => {
    getSummaryMock.mockReset();
    deleteMock.mockReset();
    signOutMock.mockReset();
    toastError.mockReset();
    assignMock.mockReset();
    useModalStore.getState().resetAllModals();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  it('N-04: deleteUserAccount UNAUTHORIZED routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    getSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    deleteMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));
    renderSettings();
    await openDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');
    await user.click(
      screen.getByRole('button', { name: 'Yes, Delete My Account' })
    );

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-04: summary UNAUTHORIZED routes to sign-in instead of the count-failed Alert', async () => {
    const user = userEvent.setup();
    getSummaryMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));
    renderSettings();
    await openDialog(user);

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
  });

  it('N-09: a rejected deleteUserAccount routes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    getSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    deleteMock.mockRejectedValue(new Error('401'));
    renderSettings();
    await openDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');
    await user.click(
      screen.getByRole('button', { name: 'Yes, Delete My Account' })
    );

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('N-09: a rejected summary call routes to sign-in', async () => {
    const user = userEvent.setup();
    getSummaryMock.mockRejectedValue(new Error('401'));
    renderSettings();
    await openDialog(user);

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
  });

  it('N-12: reopening SCR-08 after a failed delete has Export usable again', async () => {
    const user = userEvent.setup();
    getSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    deleteMock.mockResolvedValue(fail('FAILED', 'Something went wrong.'));
    renderSettings();
    await openDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');
    await user.click(
      screen.getByRole('button', { name: 'Yes, Delete My Account' })
    );
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Delete your account?')).not.toBeInTheDocument()
    );

    await openDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');
    expect(
      screen.getByRole('button', { name: /export my data first/i })
    ).toBeEnabled();
  });

  it('N-14: a signOut rejection after a successful delete does not say "Nothing was removed"', async () => {
    const user = userEvent.setup();
    getSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    deleteMock.mockResolvedValue(ok(undefined));
    signOutMock.mockRejectedValue(new Error('signOut failed'));
    renderSettings();
    await openDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');
    await user.click(
      screen.getByRole('button', { name: 'Yes, Delete My Account' })
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
    for (const call of toastError.mock.calls) {
      expect(String(call[0])).not.toMatch(/nothing was removed/i);
    }
  });
});
