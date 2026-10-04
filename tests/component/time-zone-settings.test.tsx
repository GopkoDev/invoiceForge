// @vitest-environment jsdom
// T05 (spec.md §5 AC-22; screens.md SCR-02) — the Time zone card on Profile settings: shows the
// saved zone, lets the Freelancer search and change it, and routes every updateTimeZone outcome.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';

const updateMock = vi.fn();
const getProfileMock = vi.fn();
vi.mock('@/lib/actions/profile-actions', () => ({
  updateTimeZone: (...a: unknown[]) => updateMock(...a),
  getProfile: (...a: unknown[]) => getProfileMock(...a),
  updateProfile: vi.fn(),
}));
vi.mock('@/lib/actions/account-actions', () => ({
  deleteUserAccount: vi.fn(),
  getAccountDeletionSummary: vi.fn(),
}));
vi.mock('@/auth', () => ({
  auth: async () => ({ user: { id: 'u1', name: 'Ann', email: 'a@b.c' } }),
}));
vi.mock('@/components/settings/profile-settings', () => ({
  ProfileSettings: () => <div data-testid="profile-card">Profile Information</div>,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const goToSignInMock = vi.fn();
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: () => goToSignInMock(),
  redirectIfUnauthorized: (r: { success: boolean; code?: string }) => {
    if (!r.success && r.code === 'UNAUTHORIZED') {
      goToSignInMock();
      return true;
    }
    return false;
  },
}));

const { TimeZoneSettings } = await import(
  '@/components/settings/time-zone-settings'
);

const { TIME_ZONE_MESSAGE } = await import('@/lib/validations/profile');
const input = () => screen.getByRole('combobox') as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: /save/i });

async function choose(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.click(input());
  await user.clear(input());
  await user.type(input(), query);
  const option = await screen.findByRole('option', {
    name: new RegExp(query, 'i'),
  });
  await user.click(option);
}

describe('TimeZoneSettings (SCR-02)', () => {
  beforeEach(() => {
    updateMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    goToSignInMock.mockReset();
  });

  it('default: shows the saved zone with its UTC offset', () => {
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    expect(
      screen.getByText('Time zone', { selector: '[data-slot="card-title"]' })
    ).toBeTruthy();
    expect(input().value).toMatch(/^Europe\/Kyiv \(UTC[+-]\d{2}:\d{2}\)$/);
    expect(saveButton().hasAttribute('disabled')).toBe(false);
  });

  it('not-set: empty combobox, UTC description, Save disabled until a zone is chosen', async () => {
    const user = userEvent.setup();
    render(<TimeZoneSettings timeZone={null} />);
    expect(input().value).toBe('');
    expect(
      screen.getByText('Not set yet. UTC is used until you choose one.')
    ).toBeTruthy();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    await choose(user, 'Europe/Berlin');
    expect(saveButton().hasAttribute('disabled')).toBe(false);
  });

  it('searches the zone list by name or city and saves the chosen zone', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(ok());
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    await choose(user, 'Tokyo');
    await user.click(saveButton());
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('Asia/Tokyo'));
    expect(toastSuccess).toHaveBeenCalledWith('Time zone saved.');
  });

  it('saving: Save and the combobox are disabled while the call is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    updateMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    await user.click(saveButton());
    await waitFor(() =>
      expect(saveButton().hasAttribute('disabled')).toBe(true)
    );
    expect(input().disabled).toBe(true);
    resolve(ok());
    await waitFor(() =>
      expect(saveButton().hasAttribute('disabled')).toBe(false)
    );
    expect(input().disabled).toBe(false);
  });

  it('save with no change is allowed and reports success', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(ok());
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    await user.click(saveButton());
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('Europe/Kyiv'));
    expect(toastSuccess).toHaveBeenCalledWith('Time zone saved.');
  });

  it('validation: shows TIME_ZONE_MESSAGE verbatim, keeps the value, saves nothing', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(
      fail('VALIDATION', TIME_ZONE_MESSAGE, {
        fieldErrors: { timeZone: [TIME_ZONE_MESSAGE] },
      })
    );
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    await user.click(saveButton());
    expect(await screen.findByText(TIME_ZONE_MESSAGE)).toBeTruthy();
    expect(input().value).toMatch(/^Europe\/Kyiv/);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('FAILED: toast.error with the result error', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(
      fail('FAILED', 'Could not save the time zone.')
    );
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    await user.click(saveButton());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Could not save the time zone.')
    );
    expect(goToSignInMock).not.toHaveBeenCalled();
  });

  it('UNAUTHORIZED: goes to sign-in, no toast', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    await user.click(saveButton());
    await waitFor(() => expect(goToSignInMock).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a rejected call goes to sign-in', async () => {
    const user = userEvent.setup();
    updateMock.mockRejectedValue(new Error('network'));
    render(<TimeZoneSettings timeZone="Europe/Kyiv" />);
    await user.click(saveButton());
    await waitFor(() => expect(goToSignInMock).toHaveBeenCalledTimes(1));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('Profile settings page (SCR-02)', () => {
  it('renders the Time zone card under the profile card with the saved zone', async () => {
    getProfileMock.mockResolvedValue(
      ok({ name: 'Ann', email: 'a@b.c', image: null, timeZone: 'Europe/Kyiv' })
    );
    const { default: ProfilePage } = await import(
      '@/app/(protected)/settings/profile/page'
    );
    render(await ProfilePage());
    const profileCard = screen.getByTestId('profile-card');
    const zoneTitle = screen.getByText('Time zone', {
      selector: '[data-slot="card-title"]',
    });
    expect(
      profileCard.compareDocumentPosition(zoneTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(input().value).toMatch(/^Europe\/Kyiv/);
  });
});
