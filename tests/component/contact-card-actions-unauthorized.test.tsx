// @vitest-environment jsdom
// T39 (spec.md §5 AC-21; review-2026-09-27.md F-34) —
// docs/features/architecture-hardening/tasks.json T39, cite
// components/layout/contacts/contact-card/contact-card-actions.tsx:70.
//
// AC-21: a stale session performing any action must be treated as a Visitor — signed out, not
// just told a generic error happened. handleConfirm()'s final branch toasts every non-success
// code the same way, including UNAUTHORIZED, and never routes to sign-in.
//
// RED (T39 not yet implemented): confirming delete on an UNAUTHORIZED result never navigates
// anywhere, so window.location.assign is never called.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { ContactCardActions } = await import(
  '@/components/layout/contacts/contact-card/contact-card-actions'
);
const { CustomerModalContainer } = await import(
  '@/components/modals/customer/customer-modal-container'
);
const { useModalStore } = await import('@/store/use-modal-store');

describe('ContactCardActions — UNAUTHORIZED delete routes to sign-in (T39, F-34, AC-21)', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    toastError.mockReset();
    assignMock.mockReset();
    useModalStore.getState().resetAllModals();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  it('sends the device to the cookie-clearing sign-in route instead of a generic toast', async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn().mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));

    render(
      <>
        <ContactCardActions
          id="cust-1"
          name="Acme"
          detailRoute="/customers/cust-1"
          deleteAction={deleteAction}
          entityLabel="Customer"
          showPreview={false}
        />
        <CustomerModalContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
    expect(toastError).not.toHaveBeenCalledWith('Not signed in.');
  });
});
