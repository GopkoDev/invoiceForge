// @vitest-environment jsdom
// editor-ux T16 (spec.md §5 AC-11, AC-12; sad.md §8 "Accessibility", Flow 9) — every editor field
// announces its visible label, line fields announce "{column}, line {n}" from the current index,
// icon-only buttons and the narrow-screen Print/Download keep a name, row actions name the action
// and the invoice number, and a refused field is invalid with its message as its description.
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { InvoiceEditorData, InvoiceFormItem } from '@/types/invoice/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: vi.fn(),
  duplicateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  updateInvoice: vi.fn(),
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-2026-0043' }),
}));
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({ downloadInvoicePdf: vi.fn(), printInvoicePdf: vi.fn() }));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));
vi.mock('@/lib/utils/image-to-base64', () => ({ fetchLogoDataUrl: vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};

const { renderWithEditorStore, emptyEditorData } = await import('../support/render-with-editor-store');
const { ItemsSection } = await import('@/components/invoice-editor/items-section');
const { InvoiceItemRow } = await import('@/components/invoice-editor/invoice-item-row');
const { SenderSection } = await import('@/components/invoice-editor/sender-section');
const { CustomerSection } = await import('@/components/invoice-editor/customer-section');
const { InvoiceDetailsSection } = await import('@/components/invoice-editor/invoice-details-section');
const { SummarySection } = await import('@/components/invoice-editor/summary-section');
const { NotesSection } = await import('@/components/invoice-editor/notes-section');
const { PDFPreviewPanel } = await import('@/components/invoice-editor/pdf-preview-panel');
const { InvoiceEditorResizePanels } = await import(
  '@/components/invoice-editor/invoice-editor-resize-panels'
);
const { useInvoicePdf } = await import('@/hooks/use-invoice-pdf');
const { DashboardRecentInvoices } = await import(
  '@/components/dashboard/recent-invoices/dashboard-recent-invoices'
);
const { RelatedInvoicesList } = await import('@/components/invoices/related-invoices-list');
const { InvoiceEditorHeader } = await import('@/components/invoice-editor/invoice-editor-header');
const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');

const line = (n: number): InvoiceFormItem => ({
  id: `it-${n}`,
  productId: '',
  productName: `Item ${n}`,
  description: '',
  unit: 'pcs',
  quantity: n,
  price: n * 10,
  total: n * n * 10,
});

function dataWithLines(count = 3): InvoiceEditorData {
  const base = emptyEditorData();
  return {
    ...base,
    initialData: { ...base.initialData!, items: Array.from({ length: count }, (_, i) => line(i + 1)) },
  };
}

describe('AC-11 — line fields announce their column and current position', () => {
  it('names price and quantity "{column}, line {n}" and keeps n correct after reorder and delete', () => {
    const { store } = renderWithEditorStore(<ItemsSection />, { initial: dataWithLines() });

    expect(screen.getByRole('textbox', { name: 'Quantity, line 3' })).toHaveValue('3');
    expect(screen.getByRole('textbox', { name: 'Price, line 1' })).toHaveValue('10');

    act(() => store.getState().reorderItems(2, 0)); // item 3 moves to the top
    expect(screen.getByRole('textbox', { name: 'Quantity, line 1' })).toHaveValue('3');
    expect(screen.getByRole('textbox', { name: 'Quantity, line 3' })).toHaveValue('2');

    act(() => store.getState().deleteItem('it-1')); // lines are now [3, 2]
    expect(screen.queryByRole('textbox', { name: 'Quantity, line 3' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Quantity, line 2' })).toHaveValue('2');
  });

  // T68 (review r7 G2): the "added" case of AC-11.
  it('keeps n correct after a line is duplicated or added', () => {
    const { store } = renderWithEditorStore(<ItemsSection />, { initial: dataWithLines() });

    act(() => store.getState().duplicateItem('it-1')); // lines are now [1, 1, 2, 3]
    expect(screen.getByRole('textbox', { name: 'Quantity, line 2' })).toHaveValue('1');
    expect(screen.getByRole('textbox', { name: 'Quantity, line 3' })).toHaveValue('2');
    expect(screen.getByRole('textbox', { name: 'Quantity, line 4' })).toHaveValue('3');

    act(() => store.getState().addItem()); // a fifth, empty line at the end
    expect(screen.getByRole('textbox', { name: 'Quantity, line 5' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Quantity, line 4' })).toHaveValue('3');
  });

  // T74 (review r8 H3; test-plan.md edge case): the reorder a screen-reader user makes, through the
  // drag handle and dnd-kit's KeyboardSensor, not the store. jsdom lays nothing out, so each line's
  // box is stubbed from its current DOM position (one 80 px row per line).
  it('keeps n correct after a line is moved to the top with the keyboard', async () => {
    const { container } = renderWithEditorStore(<ItemsSection />, { initial: dataWithLines() });
    const lineBoxes = () =>
      Array.from(container.querySelectorAll('button[aria-label^="Reorder line"]'), (h) => h.parentElement!.parentElement!);
    const realRect = Element.prototype.getBoundingClientRect;
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const i = lineBoxes().indexOf(this as HTMLElement);
      if (i < 0) return realRect.call(this);
      return { x: 0, y: i * 80, top: i * 80, left: 0, right: 600, bottom: i * 80 + 80, width: 600, height: 80, toJSON() {} };
    });
    const user = userEvent.setup();

    try {
      screen.getByRole('button', { name: 'Reorder line 3' }).focus();
      await user.keyboard('[Space]');
      await user.keyboard('[ArrowUp]');
      await user.keyboard('[ArrowUp]');
      await user.keyboard('[Space]');

      expect(screen.getByRole('textbox', { name: 'Quantity, line 1' })).toHaveValue('3');
      expect(screen.getByRole('textbox', { name: 'Quantity, line 2' })).toHaveValue('1');
      expect(screen.getByRole('textbox', { name: 'Quantity, line 3' })).toHaveValue('2');
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('names the mobile card fields the same way', () => {
    renderWithEditorStore(<InvoiceItemRow itemId="it-3" />, { initial: dataWithLines() });
    expect(screen.getByRole('textbox', { name: 'Quantity, line 3' })).toHaveValue('3');
    expect(screen.getByRole('textbox', { name: 'Price, line 3' })).toHaveValue('30');
  });
});

describe('AC-11 — icon-only buttons have an announced name', () => {
  it('names duplicate, delete and reorder for every line', () => {
    renderWithEditorStore(<ItemsSection />, { initial: dataWithLines() });
    expect(screen.getAllByRole('button', { name: /duplicate/i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /reorder/i })).toHaveLength(3);
  });

  it('names zoom in and zoom out on the preview panel', () => {
    renderWithEditorStore(
      <PDFPreviewPanel
        source={{ kind: 'draft', form: dataWithLines().initialData!, parties: {} }}
        senderProfile={undefined}
      />
    );
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
  });

  // T64 (review r6 F1): on a phone the preview opens in the "View PDF" sheet; its icon-only
  // close button announces what it closes, not a bare "Close".
  it('names close preview on the phone preview sheet', async () => {
    render(
      <InvoiceEditorResizePanels FormComponent={<p>form</p>} PDFPreviewComponent={<p>preview</p>} />
    );
    await act(async () => {
      screen.getByRole('button', { name: /view pdf/i }).click();
    });
    const sheet = await screen.findByRole('dialog', { name: /pdf preview/i });
    expect(within(sheet).getByRole('button', { name: /^close preview$/i })).toBeInTheDocument();
  });

  it('keeps the names Print and Download when their text is hidden on narrow screens', () => {
    function Header(): ReactNode {
      const { PrintButton, DownloadButton } = useInvoicePdf();
      return (
        <>
          {PrintButton}
          {DownloadButton}
        </>
      );
    }
    renderWithEditorStore(<Header />);
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    // The visible text is hidden below the breakpoint, so the name must come from an sr-only span.
    expect(screen.getByRole('button', { name: /print/i }).querySelector('.sr-only')).not.toBeNull();
    expect(screen.getByRole('button', { name: /download/i }).querySelector('.sr-only')).not.toBeNull();
  });
});

describe('AC-11 — every editor field has its visible label as its name', () => {
  it('names the sender, customer, details, summary and notes fields', () => {
    renderWithEditorStore(
      <>
        <SenderSection />
        <CustomerSection />
        <InvoiceDetailsSection />
        <SummarySection />
        <NotesSection />
      </>
    );
    for (const name of [
      /^Sender Profile/,
      /^Bank Account/,
      /^Customer/,
      /^Invoice Number/,
      /^Currency/,
      /^PO Number/,
      /^Discount/,
      /^Shipping/,
      /^Tax/,
      /^Notes/,
      /^Payment Terms/,
      /^Terms/,
    ]) {
      expect(screen.getByLabelText(name), String(name)).toBeInTheDocument();
    }
  });
});

describe('AC-11 — row actions name the action and the invoice number', () => {
  it('names the invoices list row actions button', () => {
    render(
      <InvoiceRowActions
        invoiceId="inv-1"
        invoiceNumber="INV-0001"
        status="DRAFT"
        storedStatus="DRAFT"
        dueDate={new Date('2026-10-08T00:00:00.000Z')}
        timeZone="UTC"
        onDataChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Actions for INV-0001' })).toBeInTheDocument();
  });

  it('names the dashboard recent invoices row actions button per row', () => {
    const rows = ['INV-0001', 'INV-0002'].map((invoiceNumber, i) => ({
      id: `inv-${i}`,
      invoiceNumber,
      customerName: 'Acme',
      status: 'PENDING',
      storedStatus: 'PENDING',
      issueDate: new Date('2026-09-01T00:00:00.000Z'),
      dueDate: new Date('2026-10-20T00:00:00.000Z'),
      total: 100,
      currency: 'USD',
    }));
    render(
      <DashboardRecentInvoices
        invoices={rows as unknown as Parameters<typeof DashboardRecentInvoices>[0]['invoices']}
        timeZone="UTC"
      />
    );
    expect(screen.getByRole('button', { name: 'Actions for INV-0001' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for INV-0002' })).toBeInTheDocument();
  });

  it('names the related invoices row actions button per invoice', () => {
    const invoices = ['INV-0007', 'INV-0008'].map((invoiceNumber, i) => ({
      id: `inv-${i}`,
      invoiceNumber,
      status: 'PENDING',
      storedStatus: 'PENDING',
      issueDate: new Date('2026-09-01T00:00:00.000Z'),
      dueDate: new Date('2026-10-20T00:00:00.000Z'),
      total: 100,
      currency: 'USD',
    }));
    render(
      <RelatedInvoicesList
        invoices={invoices as unknown as Parameters<typeof RelatedInvoicesList>[0]['invoices']}
        entityType="customer"
        entityId="cu-1"
      />
    );
    expect(screen.getByRole('button', { name: 'Actions for invoice INV-0007' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for invoice INV-0008' })).toBeInTheDocument();
  });
});

describe('AC-12 — a refused field is invalid and described by its message', () => {
  it('marks the invoice number invalid and describes it by the error, then detaches after a fix', () => {
    const { store } = renderWithEditorStore(<InvoiceDetailsSection />);
    const field = () => screen.getByLabelText(/^Invoice Number/);
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');

    act(() => store.setState({ fieldErrors: { invoiceNumber: ['Invoice number is already used.'] } }));
    expect(field()).toBeInvalid();
    expect(field()).toHaveAccessibleDescription('Invoice number is already used.');

    act(() => store.setState({ fieldErrors: undefined }));
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
    expect(field()).not.toHaveAttribute('aria-describedby');
  });

  it('marks a refused line quantity invalid and describes it by the error', () => {
    const { store } = renderWithEditorStore(<ItemsSection />, { initial: dataWithLines(2) });
    act(() => store.setState({ fieldErrors: { 'items.1.quantity': ['Quantity must be above zero.'] } }));
    const qty = screen.getByRole('textbox', { name: 'Quantity, line 2' });
    expect(qty).toBeInvalid();
    expect(qty).toHaveAccessibleDescription('Quantity must be above zero.');
    expect(screen.getByRole('textbox', { name: 'Quantity, line 1' })).toBeValid();
  });

  it('describes summary fields by their errors', () => {
    const { store } = renderWithEditorStore(<SummarySection />);
    act(() => store.setState({ fieldErrors: { discount: ['Discount cannot exceed the subtotal.'] } }));
    const discount = screen.getByLabelText(/^Discount/);
    expect(discount).toBeInvalid();
    expect(discount).toHaveAccessibleDescription('Discount cannot exceed the subtotal.');
  });
});


// editor-ux T26 (AC-11, AC-12; review D6, T-b) — the phone more-actions trigger and the line product
// controls announce a name, and a refused product is described by its message.
describe('AC-11 — T26: more actions and the line product controls have an announced name', () => {
  it('names the phone more-actions trigger "More actions"', () => {
    renderWithEditorStore(<InvoiceEditorHeader />);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('names the product picker "Product, line {n}" for each line', () => {
    const base = dataWithLines(2);
    const initial = {
      ...base,
      initialData: {
        ...base.initialData!,
        items: base.initialData!.items.map((i) => ({ ...i, productId: '', productName: '' })),
      },
    };
    renderWithEditorStore(<ItemsSection />, { initial });
    expect(screen.getByRole('button', { name: 'Product, line 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Product, line 2' })).toBeInTheDocument();
  });

  it('names the custom-name input "Product, line {n}" and links the phone label to it', () => {
    const base = dataWithLines(2);
    const initial = {
      ...base,
      initialData: {
        ...base.initialData!,
        items: base.initialData!.items.map((i) => ({ ...i, productId: 'custom' })),
      },
    };
    renderWithEditorStore(<ItemsSection />, { initial });
    expect(screen.getByRole('textbox', { name: 'Product, line 1' })).toHaveValue('Item 1');
    expect(screen.getByRole('textbox', { name: 'Product, line 2' })).toHaveValue('Item 2');
    expect(screen.getAllByLabelText('Product Name').length).toBeGreaterThan(0);
  });

  it('describes the line-1 product trigger by a refused items.0.productId message', () => {
    const base = dataWithLines(2);
    const initial = {
      ...base,
      initialData: {
        ...base.initialData!,
        items: base.initialData!.items.map((i) => ({ ...i, productId: '', productName: '' })),
      },
    };
    const { store } = renderWithEditorStore(<ItemsSection />, { initial });
    act(() =>
      store.setState({ fieldErrors: { 'items.0.productId': ['This product is priced in another currency.'] } })
    );
    const trigger = screen.getByRole('button', { name: 'Product, line 1' });
    expect(trigger).toBeInvalid();
    expect(trigger).toHaveAccessibleDescription('This product is priced in another currency.');
  });
});
