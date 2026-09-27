// @vitest-environment jsdom
// T15 — ConfirmationModal: body slot, async confirm, hideable confirm button.
// See docs/features/architecture-hardening/tasks/t15-confirmation-modal-async-body.md
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationModal } from '@/components/modals/global-modals/confirmation-modal/confirmation-modal';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ConfirmationModal (component)', () => {
  // AC-20 / AC-22 / AC-17: the account-deletion, blocked-delete and legacy-totals
  // confirmations all need a body slot for counts/totals shown before confirming.
  it('renders the body slot content passed by the caller', () => {
    render(
      <ConfirmationModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete account"
        description="This cannot be undone."
        body={<p data-testid="invoice-count">3 invoices will be permanently lost.</p>}
      />
    );

    expect(screen.getByTestId('invoice-count')).toHaveTextContent(
      '3 invoices will be permanently lost.'
    );
  });

  // screens.md §SCR-14 "deleting" row: confirmed delete shows a Spinner and the dialog
  // stays open until the async onConfirm settles; caller decides when to close.
  it('shows a spinner, disables the buttons, and stays open while an async onConfirm is pending', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const gate = deferred<void>();

    render(
      <ConfirmationModal
        open
        onClose={onClose}
        onConfirm={() => gate.promise}
        title="Delete account"
        description="This cannot be undone."
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    await user.click(confirmButton);

    // Pending: spinner visible, both buttons disabled, dialog not auto-closed.
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    gate.resolve();
    await waitFor(() => expect(confirmButton).not.toBeDisabled());

    // The task brief: the caller decides whether to close on success/failure, the
    // modal itself must not auto-close an async confirm.
    expect(onClose).not.toHaveBeenCalled();
  });

  // Edge case table: "Async confirm rejects" → buttons re-enabled, dialog stays open,
  // caller shows the error.
  it('re-enables the buttons and keeps the dialog open when the async onConfirm rejects', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const gate = deferred<void>();

    render(
      <ConfirmationModal
        open
        onClose={onClose}
        onConfirm={() => gate.promise}
        title="Delete account"
        description="This cannot be undone."
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    await user.click(confirmButton);
    await screen.findByRole('status', { name: 'Loading' });

    gate.reject(new Error('delete failed'));

    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
  });

  // Checklist: keep the old sync behaviour (close right after onConfirm) for existing
  // callers so none of them change.
  it('still closes right after a synchronous onConfirm, unchanged', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete invoice"
        description="This cannot be undone."
      />
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Edge case table: hideConfirm (SCR-14 blocked) → only Cancel/Close is shown.
  it('hides the confirm button when hideConfirm is set, leaving only Cancel', () => {
    render(
      <ConfirmationModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Cannot delete customer"
        description="This customer has invoices."
        hideConfirm
      />
    );

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // Checklist: confirmDisabled prop.
  it('disables the confirm button when confirmDisabled is set', () => {
    render(
      <ConfirmationModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Save invoice"
        description="Amounts are invalid."
        confirmDisabled
      />
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
