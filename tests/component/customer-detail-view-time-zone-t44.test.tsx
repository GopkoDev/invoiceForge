// @vitest-environment jsdom
// editor-ux T44 (AC-08, review 2026-10-10 r2 Q11): the customer detail page passes the Freelancer
// time zone down CustomerDetailView -> CustomerInfoSidebar, so the customer's "Member Since" month is
// the one in that zone. Without the prop passing, the sidebar would fall back to UTC and this fails.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/helpers/auth-helpers', () => ({}));
vi.mock('@/lib/actions/bank-account-actions', () => ({}));
vi.mock('@/lib/actions/sender-profile-actions', () => ({}));
vi.mock('@/lib/actions/profile-actions', () => ({}));
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));
// The parts that are not under test and need their own server actions.
vi.mock('@/components/customers/customer-detail-delete-action', () => ({ CustomerDetailDeleteAction: () => null }));
vi.mock('@/components/customers/customer-custom-prices', () => ({ CustomerCustomPrices: () => null }));
vi.mock('@/components/invoices', () => ({ RelatedInvoicesList: () => null }));

import { CustomerDetailView } from '@/components/customers/customer-detail-view';

// 2026-01-31 20:30 UTC is already 1 February in Tokyo (UTC+9).
const customer = {
  id: 'c1',
  name: 'Acme Corp',
  companyName: null,
  email: null,
  phone: null,
  website: null,
  image: null,
  address: null,
  city: null,
  postalCode: null,
  country: null,
  taxId: null,
  notes: null,
  defaultCurrency: 'USD',
  createdAt: new Date('2026-01-31T20:30:00Z'),
  updatedAt: new Date('2026-01-31T20:30:00Z'),
  _count: { invoices: 0, customPrices: 0 },
} as unknown as React.ComponentProps<typeof CustomerDetailView>['customer'];

describe('CustomerDetailView time zone (AC-08)', () => {
  it('shows "Member Since" in the Freelancer zone: Asia/Tokyo is February 2026', () => {
    render(<CustomerDetailView customer={customer} customPrices={[]} invoices={[]} timeZone="Asia/Tokyo" />);
    expect(screen.getByText('Member Since')).toBeInTheDocument();
    expect(screen.getByText('Feb 2026')).toBeInTheDocument();
    expect(screen.queryByText('Jan 2026')).not.toBeInTheDocument();
  });

  it('control: with no zone saved it is the UTC month, January 2026', () => {
    render(<CustomerDetailView customer={customer} customPrices={[]} invoices={[]} timeZone={null} />);
    expect(screen.getByText('Jan 2026')).toBeInTheDocument();
    expect(screen.queryByText('Feb 2026')).not.toBeInTheDocument();
  });
});
