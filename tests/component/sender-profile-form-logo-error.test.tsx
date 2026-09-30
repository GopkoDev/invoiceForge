// @vitest-environment jsdom
// T20 (spec.md §5 AC-04) — SCR-05 sender profile editor: a VALIDATION result with
// fieldErrors.logo shows the secure-address message next to the logo field, and nothing routes
// away (the values are kept). See
// docs/features/architecture-hardening/tasks/t20-sender-profile-https-logo.md (Inlined context:
// screens.md §SCR-05, verbatim: "validation (logo) | VALIDATION with fieldErrors.logo: "The
// link must be a secure web address (https://…)." shown next to the logo field. Nothing is
// saved and the values are kept").
//
// RED (T20 not yet implemented): SenderProfileForm's onSubmit only ever inspects
// result.error.includes('This invoice prefix is already in use.') to set a field error — any
// other VALIDATION result (including fieldErrors.logo) is only surfaced as a generic
// toast.error, never rendered next to the logo input.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';

const createSenderProfileMock = vi.fn();
const updateSenderProfileMock = vi.fn();
vi.mock('@/lib/actions/sender-profile-actions', () => ({
  createSenderProfile: (...args: unknown[]) => createSenderProfileMock(...args),
  updateSenderProfile: (...args: unknown[]) => updateSenderProfileMock(...args),
}));

const routerPush = vi.fn();
const routerRefresh = vi.fn();
const routerBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh, back: routerBack }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const CONTRACT_MESSAGE = 'The link must be a secure web address (https://…).';

const { SenderProfileForm } = await import(
  '@/components/sender-profiles/sender-profile-form'
);

describe('SenderProfileForm — logo field-error state (T20, AC-04)', () => {
  it('shows the secure-address message next to the logo field on a VALIDATION fieldErrors.logo result, and keeps the entered value', async () => {
    const user = userEvent.setup();
    createSenderProfileMock.mockResolvedValue(
      fail('VALIDATION', 'Please fix the highlighted fields.', {
        fieldErrors: { logo: [CONTRACT_MESSAGE] },
      })
    );

    render(<SenderProfileForm />);

    await user.type(screen.getByLabelText(/^Name/), 'Acme LLC');
    await user.type(screen.getByLabelText(/Invoice Prefix/), 'INV');
    await user.type(screen.getByLabelText(/Logo URL/), 'http://example.com/logo.png');
    await user.click(screen.getByRole('button', { name: /Create Profile/ }));

    expect(await screen.findByText(CONTRACT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText(/Logo URL/)).toHaveValue('http://example.com/logo.png');
    expect(routerPush).not.toHaveBeenCalled();
  });
});
