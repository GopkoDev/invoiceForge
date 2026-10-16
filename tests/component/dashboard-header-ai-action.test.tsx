// @vitest-environment jsdom
// ai-chat-v2 T26 (AC-30): the dashboard header's "Create invoice with AI" link before "Create Invoice".
// (T80 removed the dashboard AI block; this header action stays.)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

import { DashboardHeader } from '@/components/dashboard/header/dashboard-header';

afterEach(cleanup);

describe('DashboardHeader - Create invoice with AI (AC-30)', () => {
  it('sits just before "Create Invoice" and opens /ai?start=draft&from=dashboard', () => {
    render(<DashboardHeader currencyTabs={[]} selectedCurrency="USD" appliedPeriod={undefined} today="2026-10-13" />);
    const links = screen.getAllByRole('link');
    const ai = screen.getByRole('link', { name: 'Create invoice with AI' });
    const create = screen.getByRole('link', { name: 'Create new invoice' });
    expect(ai.getAttribute('href')).toBe('/ai?start=draft&from=dashboard');
    expect(links.indexOf(ai)).toBe(links.indexOf(create) - 1);
  });
});
