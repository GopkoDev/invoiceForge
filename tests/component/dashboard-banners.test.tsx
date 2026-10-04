// @vitest-environment jsdom
// T22 — SCR-01 banners: overdue-rule notice (AC-24) and Connect your AI entry point (AC-01).
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));

const dismissMock = vi.fn();
vi.mock('@/lib/actions/dashboard-actions', () => ({
  dismissOverdueRuleNotice: () => dismissMock(),
}));
const goToSignIn = vi.fn();
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: () => goToSignIn(),
  redirectIfUnauthorized: (r: { success: boolean; code?: string }) => {
    if (!r.success && r.code === 'UNAUTHORIZED') {
      goToSignIn();
      return true;
    }
    return false;
  },
}));

import { OverdueRuleNotice } from '@/components/dashboard/overdue-rule-notice';
import { ConnectAiEntry } from '@/components/dashboard/connect-ai-entry';
import { DashboardBanners } from '@/components/dashboard/dashboard-banners';
import { protectedRoutes } from '@/config/routes.config';

beforeEach(() => {
  dismissMock.mockReset();
  toastError.mockReset();
  goToSignIn.mockReset();
});
afterEach(cleanup);

describe('OverdueRuleNotice', () => {
  it('shows the copy and a Got it button', () => {
    render(<OverdueRuleNotice />);
    expect(screen.getByText('Overdue is now automatic')).toBeTruthy();
    expect(document.body.textContent).toContain(
      'Pending invoices past their due date now count as overdue on their own'
    );
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('dismissed: Got it calls the action and removes the notice', async () => {
    dismissMock.mockResolvedValue({ success: true, data: undefined });
    render(<OverdueRuleNotice />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByText('Overdue is now automatic')).toBeNull());
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it('dismiss failed: toast.error with the result error and the notice stays', async () => {
    dismissMock.mockResolvedValue({ success: false, code: 'FAILED', error: 'Something went wrong.' });
    render(<OverdueRuleNotice />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Something went wrong.'));
    expect(screen.getByText('Overdue is now automatic')).toBeTruthy();
  });

  it('UNAUTHORIZED sends the device to sign-in, no toast', async () => {
    dismissMock.mockResolvedValue({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in' });
    render(<OverdueRuleNotice />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(goToSignIn).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('ConnectAiEntry', () => {
  it('links to the connect page with the entry copy', () => {
    render(<ConnectAiEntry />);
    expect(screen.getByText('Connect your AI')).toBeTruthy();
    expect(document.body.textContent).toContain('Read-only.');
    const link = screen.getByRole('link', { name: /Connect your AI/ });
    expect(link.getAttribute('href')).toBe(protectedRoutes.settingsAssistants);
  });
});

describe('DashboardBanners order and conditions', () => {
  const setup = {
    hasSenderProfiles: false,
    hasBankAccounts: false,
    hasCustomers: false,
    hasProducts: false,
    isComplete: false,
  };

  it('renders setup alert, then notice, then entry point, each only under its condition', () => {
    const { container, rerender } = render(
      <DashboardBanners setupStatus={setup} showOverdueRuleNotice showConnectAiEntry />
    );
    const text = container.textContent ?? '';
    const a = text.indexOf('Setup Required');
    const b = text.indexOf('Overdue is now automatic');
    const c = text.indexOf('Ask Claude or Cursor');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);

    rerender(
      <DashboardBanners
        setupStatus={{ ...setup, isComplete: true }}
        showOverdueRuleNotice={false}
        showConnectAiEntry={false}
      />
    );
    const after = container.textContent ?? '';
    expect(after).not.toContain('Setup Required');
    expect(after).not.toContain('Overdue is now automatic');
    expect(after).not.toContain('Ask Claude or Cursor');
  });
});
