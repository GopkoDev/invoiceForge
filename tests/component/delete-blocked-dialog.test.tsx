// @vitest-environment jsdom
// T19 (spec.md §5 AC-22) — SCR-14 "blocked" state: deleting a Customer or sender profile that
// has invoices shows the destructive Alert with the result's `error`, hides the Delete/Confirm
// button (only "Close" remains), and removes nothing.
//
// F-44 (review-2026-09-27.md, Group 8): the blocked dialog's own footer button must say "Close",
// not the leftover "Cancel" text — checked by scoping to the dialog's footer (`data-slot`
// "dialog-footer") so the assertion can't accidentally match the Dialog's separate, always-present
// sr-only "Close" icon button instead (contact-card-actions.tsx only set `hideConfirm`, never
// `cancelText`, so the footer button kept its default "Cancel" label).
// See docs/features/architecture-hardening/tasks/t19-block-deleting-records-with-invoices.md and
// test-plan.md AC-22 row "delete-record dialog shows the blocked block" (component).
//
// Assumed API/result shapes: deleteCustomer/deleteSenderProfile resolve with
// ActionResult<void> = { success: false, code: 'CONFLICT', error: '<contract message>',
// details: { kind: 'HAS_INVOICES', invoiceCount: N } } per contracts/server-actions.md.
//
// RED (T19 not yet implemented): `components/layout/contacts/contact-card/contact-card-actions.tsx`
// (shared by `customer-card-actions.tsx` / `sender-profile-card-actions.tsx`) only ever calls
// `toast.error(result.error)` on a failed delete — it never inspects `details.kind`, never
// re-opens the modal with a `body` Alert or `hideConfirm`, so the dialog just stays in its
// default "Delete / Cancel" state instead of switching to SCR-14's blocked state. In addition,
// `CustomerModalContainer` / `SenderProfileModalContainer` never forward `body`/`hideConfirm`
// from the modal store to `ConfirmationModal` at all (same T15 wiring gap as SettingsModalContainer
// had before T18), so even a caller that set them would not see them rendered.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';

/** Scopes a "Close" button query to the dialog's footer, never the Dialog's own always-present
 * sr-only "Close" icon button (which also has accessible name "Close"). */
function footerCloseButton() {
  const footer = document.querySelector('[data-slot="dialog-footer"]');
  if (!footer) throw new Error('dialog footer not found');
  return within(footer as HTMLElement).getByRole('button', { name: 'Close' });
}

const deleteCustomerMock = vi.fn();
vi.mock('@/lib/actions/customer-actions', () => ({
  deleteCustomer: (...args: unknown[]) => deleteCustomerMock(...args),
}));

const deleteSenderProfileMock = vi.fn();
vi.mock('@/lib/actions/sender-profile-actions', () => ({
  deleteSenderProfile: (...args: unknown[]) => deleteSenderProfileMock(...args),
}));

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const { CustomerCardActions } = await import(
  '@/components/customers/customer-card-actions'
);
const { SenderProfileCardActions } = await import(
  '@/components/sender-profiles/sender-profile-card-actions'
);
const { CustomerModalContainer } = await import(
  '@/components/modals/customer/customer-modal-container'
);
const { SenderProfileModalContainer } = await import(
  '@/components/modals/sender-profile/sender-profile-modal-container'
);
const { useModalStore } = await import('@/store/use-modal-store');

async function clickDelete(user: ReturnType<typeof userEvent.setup>) {
  // ContactCardActions renders a Preview link button and a single icon-only delete Button.
  const buttons = screen.getAllByRole('button');
  await user.click(buttons[buttons.length - 1]);
}

describe('SCR-14 blocked delete (T19, AC-22)', () => {
  beforeEach(() => {
    deleteCustomerMock.mockReset();
    deleteSenderProfileMock.mockReset();
    routerRefresh.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    useModalStore.getState().resetAllModals();
  });

  it('shows the blocked Alert with the count and hides the confirm button when deleting a Customer with invoices', async () => {
    const user = userEvent.setup();
    deleteCustomerMock.mockResolvedValue(
      fail('CONFLICT', "3 invoices depend on this customer, so it can't be deleted.", {
        details: { kind: 'HAS_INVOICES', invoiceCount: 3 },
      })
    );

    render(
      <>
        <CustomerCardActions customerId="cust-1" customerName="Acme Ltd" />
        <CustomerModalContainer />
      </>
    );

    await clickDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(
        "3 invoices depend on this customer, so it can't be deleted."
      )
    ).toBeInTheDocument();

    // SCR-14 blocked: Delete/Confirm is hidden, only Close remains — the dialog's own footer
    // button, not just the Dialog's separate sr-only close icon.
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(footerCloseButton()).toBeInTheDocument();

    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('shows the blocked Alert for a sender profile with invoices, same as the race case', async () => {
    const user = userEvent.setup();
    deleteSenderProfileMock.mockResolvedValue(
      fail(
        'CONFLICT',
        "1 invoices depend on this sender profile, so it can't be deleted.",
        { details: { kind: 'HAS_INVOICES', invoiceCount: 1 } }
      )
    );

    render(
      <>
        <SenderProfileCardActions profileId="profile-1" profileName="My Company" />
        <SenderProfileModalContainer />
      </>
    );

    await clickDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(
        "1 invoices depend on this sender profile, so it can't be deleted."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(footerCloseButton()).toBeInTheDocument();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('waits for the async confirm result before deciding blocked vs deleted, per the ConfirmationModal contract', async () => {
    const user = userEvent.setup();
    let resolveDelete!: (value: Awaited<ReturnType<typeof deleteCustomerMock>>) => void;
    deleteCustomerMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );

    render(
      <>
        <CustomerCardActions customerId="cust-2" customerName="Beta Inc" />
        <CustomerModalContainer />
      </>
    );

    await clickDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    resolveDelete(
      fail('CONFLICT', "2 invoices depend on this customer, so it can't be deleted.", {
        details: { kind: 'HAS_INVOICES', invoiceCount: 2 },
      })
    );

    expect(
      await screen.findByText(
        "2 invoices depend on this customer, so it can't be deleted."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
