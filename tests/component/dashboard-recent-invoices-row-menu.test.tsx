// @vitest-environment jsdom
// invoice-integrity T27 (F8, S4; AC-04, AC-05; screens.md SCR-01) — the dashboard's recent-invoice
// row menu is built from the stored status and "today" is resolved in the Freelancer's time zone,
// not the browser's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: vi.fn(),
  duplicateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
}));
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  downloadInvoicePdf: vi.fn(),
  printInvoicePdf: vi.fn(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));

const { DashboardRecentInvoices } = await import(
  '@/components/dashboard/recent-invoices/dashboard-recent-invoices'
);

type Row = Parameters<typeof DashboardRecentInvoices>[0]['invoices'][number];

function row(overrides: Record<string, unknown>): Row {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    customerName: 'Acme',
    status: 'OVERDUE',
    storedStatus: 'OVERDUE',
    issueDate: new Date('2026-09-01T00:00:00.000Z'),
    dueDate: new Date('2026-10-08T00:00:00.000Z'),
    total: 100,
    currency: 'USD',
    ...overrides,
  } as Row;
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /actions for/i }));
  await screen.findByText('Duplicate');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 2026-10-08 12:00Z: Pago Pago (UTC-11) is on 8 Oct, Kiritimati (UTC+14) is already on 9 Oct.
  vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('DashboardRecentInvoices row menu (T27)', () => {
  it('a stored-PENDING invoice past due reads Overdue but offers Mark as Overdue, Mark as Paid and Cancel', async () => {
    render(
      <DashboardRecentInvoices
        timeZone="UTC"
        invoices={[row({ status: 'OVERDUE', storedStatus: 'PENDING', dueDate: new Date('2020-01-10T00:00:00.000Z') })]}
      />
    );
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    await openMenu();
    expect(screen.getByText('Mark as Overdue')).toBeInTheDocument();
    expect(screen.getByText('Mark as Paid')).toBeInTheDocument();
    expect(screen.getByText('Cancel Invoice')).toBeInTheDocument();
    expect(screen.queryByText('Mark as Pending')).not.toBeInTheDocument();
  });

  it('resolves "today" in the Freelancer zone: due 8 Oct is not past due in Pago Pago', async () => {
    render(<DashboardRecentInvoices timeZone="Pacific/Pago_Pago" invoices={[row({})]} />);
    await openMenu();
    expect(screen.getByText('Mark as Pending')).toBeInTheDocument();
  });

  it('resolves "today" in the Freelancer zone: due 8 Oct is past due in Kiritimati', async () => {
    render(<DashboardRecentInvoices timeZone="Pacific/Kiritimati" invoices={[row({})]} />);
    await openMenu();
    expect(screen.queryByText('Mark as Pending')).not.toBeInTheDocument();
  });
});
