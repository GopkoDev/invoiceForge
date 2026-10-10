// @vitest-environment jsdom
// editor-ux T27 (AC-08, ADR-0006, review D7): "Member Since" on the customer sidebar is shown in
// the Freelancer time zone passed from the server; with no zone it falls back to UTC.
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

import { CustomerInfoSidebar } from '@/components/customers/customer-info-sidebar';

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
} as unknown as React.ComponentProps<typeof CustomerInfoSidebar>['customer'];

describe('CustomerInfoSidebar time zone (T27, AC-08)', () => {
  it('shows the month in the Freelancer zone (Asia/Tokyo -> Feb 2026)', () => {
    render(<CustomerInfoSidebar customer={customer} timeZone="Asia/Tokyo" />);
    expect(screen.getByText('Feb 2026')).toBeTruthy();
  });

  it('falls back to UTC when no zone is set (Jan 2026)', () => {
    render(<CustomerInfoSidebar customer={customer} timeZone={null} />);
    expect(screen.getByText('Jan 2026')).toBeTruthy();
  });
});

describe('customer detail page passes the Freelancer zone (T27)', () => {
  it('hands the acting Freelancer timeZone to CustomerDetailView', async () => {
    vi.resetModules();
    vi.doMock('@/lib/actions/customer-actions', () => ({
      getCustomer: vi.fn(async () => ({ success: true, data: customer })),
    }));
    vi.doMock('@/lib/actions/custom-price-actions', () => ({
      getCustomerCustomPrices: vi.fn(async () => ({ success: true, data: [] })),
    }));
    vi.doMock('@/lib/actions/invoice-actions/invoice-actions', () => ({
      getInvoicesByCustomer: vi.fn(async () => ({ success: true, data: [] })),
    }));
    vi.doMock('@/lib/helpers/session-actor', () => ({
      actingFreelancerFromSession: vi.fn(async () => ({
        success: true,
        data: { timeZone: 'Asia/Tokyo' },
      })),
    }));
    vi.doMock('@/components/layout/content-area', () => ({
      unwrapPageResult: (r: { data: unknown }) => r.data,
    }));
    vi.doMock('@/components/customers', () => ({
      CustomerDetailView: () => null,
    }));
    const { default: Page } = await import('@/app/(protected)/customers/[id]/page');
    const el = (await Page({ params: Promise.resolve({ id: 'c1' }) })) as {
      props: Record<string, unknown>;
    };
    expect(el.props.timeZone).toBe('Asia/Tokyo');
  });
});
