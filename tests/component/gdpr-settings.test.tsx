// @vitest-environment jsdom
// T18 — SCR-08 delete-account confirmation: the summary (count/zero/count-failed + Retry),
// the "Export my data first" offer, the deleting spinner, and the FAILED/success outcomes.
// See docs/features/architecture-hardening/tasks/t18-delete-account-dialog.md
//
// GdprSettings today opens the ConfirmationModal with a hardcoded description and never calls
// getAccountDeletionSummary, and SettingsModalContainer never forwards `body`/`confirmDisabled`
// to ConfirmationModal (T15) — so every assertion below is expected to fail until T18 wires the
// summary load, the export offer and the SCR-08 states through both files.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';

const getAccountDeletionSummaryMock = vi.fn();
const deleteUserAccountMock = vi.fn();
vi.mock('@/lib/actions/account-actions', () => ({
  getAccountDeletionSummary: (...args: unknown[]) =>
    getAccountDeletionSummaryMock(...args),
  deleteUserAccount: (...args: unknown[]) => deleteUserAccountMock(...args),
}));

const signOutMock = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const { GdprSettings } = await import('@/components/settings/gdpr-settings');
const { SettingsModalContainer } = await import(
  '@/components/modals/settings/settings-modal-container'
);
const { useModalStore } = await import('@/store/use-modal-store');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderSettings() {
  return render(
    <>
      <GdprSettings />
      <SettingsModalContainer />
    </>
  );
}

async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /delete account/i }));
}

describe('GdprSettings delete-account dialog (SCR-08)', () => {
  beforeEach(() => {
    getAccountDeletionSummaryMock.mockReset();
    deleteUserAccountMock.mockReset();
    signOutMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    useModalStore.getState().resetAllModals();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['{}'])),
      })
    );
    // jsdom lacks the blob-URL statics; add them to the real URL class (replacing URL with a
    // plain object would break every `new URL(...)` the dialog stack makes).
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows a loading skeleton and disables confirm while the summary is counting', async () => {
    const user = userEvent.setup();
    const gate = deferred<ReturnType<typeof ok<{ invoiceCount: number }>>>();
    getAccountDeletionSummaryMock.mockReturnValue(gate.promise);

    renderSettings();
    await openDeleteDialog(user);

    expect(getAccountDeletionSummaryMock).toHaveBeenCalledTimes(1);
    // counting: a Skeleton fills the count line, Confirm is disabled (screens.md SCR-08).
    // The summary never resolves here, so waiting only absorbs the dialog's lazy load.
    await waitFor(() =>
      expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: 'Yes, Delete My Account' })
    ).toBeDisabled();
  });

  it('shows the invoice count and the export offer once the summary loads (AC-20)', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 3 }));

    renderSettings();
    await openDeleteDialog(user);

    expect(
      await screen.findByText('3 invoices will be permanently lost.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /export my data first/i })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Yes, Delete My Account' })
      ).not.toBeDisabled()
    );
  });

  it('uses singular copy for exactly one invoice', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 1 }));

    renderSettings();
    await openDeleteDialog(user);

    expect(
      await screen.findByText('1 invoice will be permanently lost.')
    ).toBeInTheDocument();
  });

  it('shows the general warning without a count line when there are zero invoices', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 0 }));

    renderSettings();
    await openDeleteDialog(user);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Yes, Delete My Account' })
      ).not.toBeDisabled()
    );
    expect(
      screen.queryByText(/invoices? will be permanently lost\./)
    ).not.toBeInTheDocument();
  });

  it('shows a retry alert and keeps confirm disabled when the summary fails to load', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(
      fail('FAILED', 'Something went wrong. Please try again.')
    );

    renderSettings();
    await openDeleteDialog(user);

    expect(
      await screen.findByText("Couldn't count your invoices.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Yes, Delete My Account' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('reloads the count when Retry is pressed after a failed summary', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock
      .mockResolvedValueOnce(fail('FAILED', 'Something went wrong. Please try again.'))
      .mockResolvedValueOnce(ok({ invoiceCount: 5 }));

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText("Couldn't count your invoices.");

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(
      await screen.findByText('5 invoices will be permanently lost.')
    ).toBeInTheDocument();
    expect(getAccountDeletionSummaryMock).toHaveBeenCalledTimes(2);
  });

  it('exports the data from within the dialog without closing it, then leaves it possible to delete', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');

    await user.click(screen.getByRole('button', { name: /export my data first/i }));

    // exporting: dialog stays open, the Freelancer is back in this dialog after the download.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/user/export'));
    expect(screen.getByText('Delete your account?')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Yes, Delete My Account' })
    ).not.toBeDisabled();
  });

  it('shows the SCR-07 export-failed toast and keeps the dialog open when the export fails', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');

    await user.click(screen.getByRole('button', { name: /export my data first/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Your data couldn't be exported. Try again."
      )
    );
    expect(screen.getByText('Delete your account?')).toBeInTheDocument();
  });

  // F-45 (review-2026-09-27.md, Group 8): screens.md §SCR-08 "deleting" row says "every button
  // is disabled" while the confirmed delete is in flight — but the Export and Retry buttons live
  // in the dialog's `body` slot, so ConfirmationModal's own pending-disables (Confirm/Cancel only)
  // never reach them.
  it('disables the Export my data first button while the confirmed delete is in flight (F-45)', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    const gate = new Promise<ReturnType<typeof ok>>(() => {});
    deleteUserAccountMock.mockReturnValue(gate);

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');

    await user.click(screen.getByRole('button', { name: 'Yes, Delete My Account' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /export my data first/i })
      ).toBeDisabled()
    );
  });

  it('deletes the account and signs the Freelancer out on success (AC-20, AC-21)', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    deleteUserAccountMock.mockResolvedValue(ok());

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');

    await user.click(screen.getByRole('button', { name: 'Yes, Delete My Account' }));

    await waitFor(() =>
      expect(signOutMock).toHaveBeenCalledWith({
        callbackUrl: '/login',
        redirect: true,
      })
    );
  });

  it('closes the dialog with the contract FAILED message and does not sign out on deletion failure', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    deleteUserAccountMock.mockResolvedValue(
      fail('FAILED', "Your account couldn't be deleted. Nothing was removed.")
    );

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');

    await user.click(screen.getByRole('button', { name: 'Yes, Delete My Account' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Your account couldn't be deleted. Nothing was removed."
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Delete your account?')).not.toBeInTheDocument()
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });
});

// T39 (spec.md §5 AC-21, AC-28; review-2026-09-27.md F-34, F-36) —
// docs/features/architecture-hardening/tasks.json T39, cite
// components/settings/gdpr-settings.tsx:57,154-163,174-184.
describe('GdprSettings — UNAUTHORIZED and rejected calls (T39, F-34, F-36, AC-21)', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    getAccountDeletionSummaryMock.mockReset();
    deleteUserAccountMock.mockReset();
    toastError.mockReset();
    assignMock.mockReset();
    useModalStore.getState().resetAllModals();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  // F-34: a 401 export response is caught generically and toasted as "couldn't be exported"
  // instead of sending the device to sign-in (AC-21 — a stale session tries an action, it must
  // be signed out, never just told an unrelated error happened).
  it('routes a 401 export response to the cookie-clearing sign-in route instead of a generic toast', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');

    await user.click(screen.getByRole('button', { name: /export my data first/i }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
    expect(toastError).not.toHaveBeenCalledWith("Your data couldn't be exported. Try again.");
  });

  // F-36 / T42 N-09: a rejected summary call is a rejected action call, which the contract
  // (server-actions.md "Boundary", screens.md "Error routing") sends to sign-in — not to the
  // count-failed state a FAILED result gets.
  it('routes a rejected summary call to sign-in', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockRejectedValue(new Error('network error'));

    renderSettings();
    await openDeleteDialog(user);

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
  });

  // F-36 / T42 N-09: a rejected deleteUserAccount() call goes to sign-in (no toast, nothing
  // signed out client-side).
  it('routes a rejected deleteUserAccount call to sign-in', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    deleteUserAccountMock.mockRejectedValue(new Error('network error'));

    renderSettings();
    await openDeleteDialog(user);
    await screen.findByText('2 invoices will be permanently lost.');

    await user.click(screen.getByRole('button', { name: 'Yes, Delete My Account' }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
