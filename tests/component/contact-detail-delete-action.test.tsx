// @vitest-environment jsdom
// T35 (spec.md §5 AC-22; review-2026-09-27.md F-16) — SCR-09 and SCR-19 `delete → SCR-14` have
// no delete entry point on the detail pages.
//
// docs/features/architecture-hardening/tasks.json T35, cite screens.md SCR-09, SCR-19, SCR-14.
//
// RED: there is no CustomerDetailDeleteAction / SenderProfileDetailDeleteAction component yet,
// so the Customer and sender profile detail pages have no delete affordance at all.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail, ok } from '@/types/actions';

const deleteCustomerMock = vi.fn();
vi.mock('@/lib/actions/customer-actions', () => ({
  deleteCustomer: (...args: unknown[]) => deleteCustomerMock(...args),
}));

const deleteSenderProfileMock = vi.fn();
vi.mock('@/lib/actions/sender-profile-actions', () => ({
  deleteSenderProfile: (...args: unknown[]) => deleteSenderProfileMock(...args),
}));

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: (...args: unknown[]) => toastError(...args) },
}));

const { CustomerDetailDeleteAction } = await import(
  '@/components/customers/customer-detail-delete-action'
);
const { SenderProfileDetailDeleteAction } = await import(
  '@/components/sender-profiles/sender-profile-detail-delete-action'
);
const { CustomerModalContainer } = await import(
  '@/components/modals/customer/customer-modal-container'
);
const { SenderProfileModalContainer } = await import(
  '@/components/modals/sender-profile/sender-profile-modal-container'
);
const { useModalStore } = await import('@/store/use-modal-store');

// The trigger button on a detail page is labeled "Delete" too (unlike the icon-only list-row
// trigger), so the confirm click must be scoped to the open SCR-14 dialog once it mounts
// (ConfirmationModal loads via `next/dynamic`), or it can race and hit the trigger again.
async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
}

describe('SCR-09/SCR-19 detail-page delete entry (T35, AC-22, F-16)', () => {
  beforeEach(() => {
    deleteCustomerMock.mockReset();
    deleteSenderProfileMock.mockReset();
    routerPush.mockReset();
    routerRefresh.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    useModalStore.getState().resetAllModals();
  });

  it('deletes a Customer from its detail page and goes to the Customers list (SCR-09 → SCR-14 → SCR-12)', async () => {
    const user = userEvent.setup();
    deleteCustomerMock.mockResolvedValue(ok(undefined));

    render(
      <>
        <CustomerDetailDeleteAction customerId="cust-1" customerName="Acme Ltd" />
        <CustomerModalContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await confirmDelete(user);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Customer deleted successfully'));
    expect(routerPush).toHaveBeenCalledWith('/customers');
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('blocks deleting a Customer with invoices from the detail page, same SCR-14 blocked state', async () => {
    const user = userEvent.setup();
    deleteCustomerMock.mockResolvedValue(
      fail('CONFLICT', "2 invoices depend on this customer, so it can't be deleted.", {
        details: { kind: 'HAS_INVOICES', invoiceCount: 2 },
      })
    );

    render(
      <>
        <CustomerDetailDeleteAction customerId="cust-1" customerName="Acme Ltd" />
        <CustomerModalContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await confirmDelete(user);

    expect(
      await screen.findByText("2 invoices depend on this customer, so it can't be deleted.")
    ).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('deletes a sender profile from its detail page and goes to the Sender profiles list (SCR-19 → SCR-14 → SCR-13)', async () => {
    const user = userEvent.setup();
    deleteSenderProfileMock.mockResolvedValue(ok(undefined));

    render(
      <>
        <SenderProfileDetailDeleteAction profileId="profile-1" profileName="My Company" />
        <SenderProfileModalContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await confirmDelete(user);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Sender Profile deleted successfully'));
    expect(routerPush).toHaveBeenCalledWith('/sender-profiles');
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
