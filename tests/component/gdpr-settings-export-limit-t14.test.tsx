// @vitest-environment jsdom
// T14 (spec.md §5 AC-24; screens.md SCR-06 D-S3) — a 429 RATE_LIMITED export response shows an
// inline Alert with the local retry time instead of a toast; the next attempt clears it.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok } from '@/types/actions';

const getAccountDeletionSummaryMock = vi.fn();
vi.mock('@/lib/actions/account-actions', () => ({
  getAccountDeletionSummary: (...args: unknown[]) =>
    getAccountDeletionSummaryMock(...args),
  deleteUserAccount: vi.fn(),
}));

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const { GdprSettings } = await import('@/components/settings/gdpr-settings');
const { SettingsModalContainer } =
  await import('@/components/modals/settings/settings-modal-container');
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

describe('GdprSettings — export rate limit alert (T14, AC-24)', () => {
  const assignMock = vi.fn();
  const retryAt = '2026-10-02T14:05:00.000Z';
  const pad = (n: number) => String(n).padStart(2, '0');
  const localTime = `${pad(new Date(retryAt).getHours())}:${pad(new Date(retryAt).getMinutes())}`;
  const limitedText = `You've reached the export limit. You can export again at ${localTime}.`;
  const limitedResponse = (body: unknown) => ({
    ok: false,
    status: 429,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  });
  const rateLimitedBody = {
    success: false,
    code: 'RATE_LIMITED',
    error: 'Too many exports.',
    details: { kind: 'RETRY_AT', retryAt },
  };

  beforeEach(() => {
    getAccountDeletionSummaryMock.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    assignMock.mockReset();
    useModalStore.getState().resetAllModals();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows the export-again time as an inline alert and no toast on 429', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(limitedResponse(rateLimitedBody))
    );

    renderSettings();
    await user.click(screen.getByRole('button', { name: /export my data/i }));

    expect(await screen.findByText(limitedText)).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /export my data/i })
    ).toBeEnabled();
  });

  it('clears the alert when the next export attempt starts', async () => {
    const user = userEvent.setup();
    const gate = deferred<unknown>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(limitedResponse(rateLimitedBody))
        .mockReturnValueOnce(gate.promise)
    );

    renderSettings();
    await user.click(screen.getByRole('button', { name: /export my data/i }));
    await screen.findByText(limitedText);

    await user.click(screen.getByRole('button', { name: /export my data/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/You've reached the export limit/)
      ).not.toBeInTheDocument()
    );
  });

  it('shows the server error text without a time when retryAt is malformed', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        limitedResponse({
          ...rateLimitedBody,
          details: { kind: 'RETRY_AT', retryAt: 'nope' },
        })
      )
    );

    renderSettings();
    await user.click(screen.getByRole('button', { name: /export my data/i }));

    expect(await screen.findByText('Too many exports.')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  // F-26 (review 2026-10-03): the alert must render inside the dialog body, not behind the modal.
  it('shows the same alert inside the delete dialog when its export is rate limited', async () => {
    const user = userEvent.setup();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(limitedResponse(rateLimitedBody))
    );

    renderSettings();
    await user.click(screen.getByRole('button', { name: /delete account/i }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('2 invoices will be permanently lost.');
    await user.click(
      within(dialog).getByRole('button', { name: /export my data first/i })
    );

    expect(await within(dialog).findByText(limitedText)).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('clears the dialog alert when the next dialog export attempt starts', async () => {
    const user = userEvent.setup();
    const gate = deferred<unknown>();
    getAccountDeletionSummaryMock.mockResolvedValue(ok({ invoiceCount: 2 }));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(limitedResponse(rateLimitedBody))
        .mockReturnValueOnce(gate.promise)
    );

    renderSettings();
    await user.click(screen.getByRole('button', { name: /delete account/i }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('2 invoices will be permanently lost.');
    const exportFirst = within(dialog).getByRole('button', {
      name: /export my data first/i,
    });
    await user.click(exportFirst);
    await within(dialog).findByText(limitedText);

    await user.click(exportFirst);
    await waitFor(() =>
      expect(
        within(dialog).queryByText(/You've reached the export limit/)
      ).not.toBeInTheDocument()
    );
  });

  it('still toasts on 500 with no alert', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    renderSettings();
    await user.click(screen.getByRole('button', { name: /export my data/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Your data couldn't be exported. Try again."
      )
    );
    expect(screen.queryByText(/export limit/)).not.toBeInTheDocument();
  });

  it('still goes to sign-in on 401', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );

    renderSettings();
    await user.click(screen.getByRole('button', { name: /export my data/i }));

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
    expect(screen.queryByText(/export limit/)).not.toBeInTheDocument();
  });
});
