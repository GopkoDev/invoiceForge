// @vitest-environment jsdom
// editor-ux T28 (review-2026-10-10 D8, S5, S7, S8; AC-01, AC-02, AC-02b; ADR-0001): the REAL row
// actions menu and the REAL editor header Download / Print, with only the lazy loader mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  captureException: vi.fn(),
  loadPdfKit: vi.fn(),
  getInvoice: vi.fn(),
  goToSignIn: vi.fn(),
  fetchLogo: vi.fn(),
  buildFail: { on: false },
  buildSpy: vi.fn(),
  kit: {
    InvoicePdfDocument: () => null,
    generatePdfBlob: vi.fn(),
    downloadPdf: vi.fn(),
    printPdf: vi.fn(),
  },
}));
const { toast, captureException, loadPdfKit, getInvoice, goToSignIn, kit } = h;

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@sentry/nextjs', () => ({ captureException: h.captureException }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/pdf/load-pdf-kit', async (orig) => ({
  ...(await orig<typeof import('@/lib/pdf/load-pdf-kit')>()),
  loadPdfKit: h.loadPdfKit,
}));
vi.mock('@/lib/invoice-document', async (orig) => {
  const real = await orig<typeof import('@/lib/invoice-document')>();
  return {
    ...real,
    buildInvoiceDocument: (...a: Parameters<typeof real.buildInvoiceDocument>) => {
      h.buildSpy(...a);
      if (h.buildFail.on) throw new Error('model exploded');
      return real.buildInvoiceDocument(...a);
    },
  };
});
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: (...a: unknown[]) => h.getInvoice(...a),
  duplicateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  updateInvoice: vi.fn(),
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-1' }),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: h.goToSignIn,
  redirectIfUnauthorized: () => false,
}));
vi.mock('@/lib/utils/image-to-base64', () => ({ fetchLogoDataUrl: h.fetchLogo }));
vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, props: undefined }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@react-pdf/renderer', () => ({
  pdf: () => ({ toBlob: async () => new Blob(['pdf']) }),
  Document: () => null, Page: () => null, View: () => null, Text: () => null, Image: () => null,
  Font: { register: vi.fn() },
  StyleSheet: { create: (s: unknown) => s },
}));

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};

const { renderWithEditorStore } = await import('../support/render-with-editor-store');
const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');
const { RelatedInvoicesList } = await import('@/components/invoices/related-invoices-list');
const { InvoiceEditorHeader } = await import('@/components/invoice-editor/invoice-editor-header');
const { PdfKitLoadError } = await import('@/lib/pdf/load-pdf-kit');

const invoice = {
  id: 'inv-1', invoiceNumber: 'INV-0001', status: 'SENT',
  senderProfileId: 's1', customerId: 'c1', bankAccountId: 'b1',
  issueDate: new Date('2026-09-01T00:00:00.000Z'), dueDate: new Date('2026-10-01T00:00:00.000Z'),
  currency: 'USD', items: [], subtotal: 100, taxAmount: 0, total: 100, taxRate: 0, discount: 0,
  shipping: 0, senderProfile: { logo: null },
};
const blob = new Blob(['pdf']);

async function rowAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: /actions for/i }));
  await user.click(await screen.findByText(name));
}
const renderRow = () =>
  render(<InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="PENDING" />);

beforeEach(() => {
  vi.clearAllMocks();
  h.buildFail.on = false;
  loadPdfKit.mockResolvedValue(kit);
  kit.generatePdfBlob.mockResolvedValue(blob);
  getInvoice.mockResolvedValue({ success: true, data: invoice });
});

describe('T28 row actions menu: a PDF failure is told, reported and never mistaken for a stale session', () => {
  it('D8: a model-building error shows "could not be prepared / Try again", reports its stage, and does not go to sign-in', async () => {
    h.buildFail.on = true;
    renderRow();
    await rowAction(userEvent.setup(), 'Download PDF');
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [message, options] = toast.error.mock.calls[0];
    expect(message).toMatch(/could not be prepared/i);
    expect(options.action.label).toMatch(/try again/i);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ 'pdf.stage': expect.any(String) }) })
    );
    expect(goToSignIn).not.toHaveBeenCalled();
  });

  it('S5: Try again shows the preparing state while the toolkit loads', async () => {
    loadPdfKit.mockRejectedValueOnce(new PdfKitLoadError('offline'));
    renderRow();
    await rowAction(userEvent.setup(), 'Download PDF');
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValueOnce(new Promise((r) => (release = r)));
    act(() => toast.error.mock.calls[0][1].action.onClick());
    const trigger = screen.getByRole('button', { name: /actions for/i });
    await vi.waitFor(() => expect(trigger).toBeDisabled());
    await act(async () => release(kit));
    await vi.waitFor(() => expect(kit.downloadPdf).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(trigger).toBeEnabled());
  });

  it('S5: an unauthorized result from Try again goes to sign-in', async () => {
    getInvoice.mockResolvedValue({
      success: true,
      data: { ...invoice, senderProfile: { id: 's1', logo: 'https://x/logo.png' } },
    });
    h.fetchLogo.mockResolvedValue({ unauthorized: true });
    loadPdfKit.mockRejectedValueOnce(new PdfKitLoadError('offline'));
    renderRow();
    await rowAction(userEvent.setup(), 'Download PDF');
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(goToSignIn).not.toHaveBeenCalled();
    await act(async () => toast.error.mock.calls[0][1].action.onClick());
    await vi.waitFor(() => expect(goToSignIn).toHaveBeenCalledTimes(1));
  });

  it('S7: Print with a blocked popup offers Download and revokes the object URL', async () => {
    const real = await vi.importActual<typeof import('@/lib/pdf/invoice-pdf-kit')>(
      '@/lib/pdf/invoice-pdf-kit'
    );
    loadPdfKit.mockResolvedValue(real);
    const create = vi.fn(() => 'blob:print-1');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    // The window is opened by the click itself, before the invoice is even fetched.
    let fetched!: (r: unknown) => void;
    getInvoice.mockReturnValue(new Promise((r) => (fetched = r)));
    renderRow();
    await rowAction(userEvent.setup(), 'Print');
    expect(open).toHaveBeenCalledTimes(1);
    expect(loadPdfKit).not.toHaveBeenCalled();
    await act(async () => fetched({ success: true, data: invoice }));
    // Observable: the Freelancer is not told it worked; a Download is offered; nothing is leaked.
    await vi.waitFor(() => {
      const offered = [...toast.error.mock.calls, ...toast.warning.mock.calls].some(
        ([, o]) => o?.action && /download/i.test(String(o.action.label))
      );
      expect(offered).toBe(true);
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('S7: a successful Print navigates the opened window to the blob and revokes that URL once it has loaded', async () => {
    const real = await vi.importActual<typeof import('@/lib/pdf/invoice-pdf-kit')>(
      '@/lib/pdf/invoice-pdf-kit'
    );
    loadPdfKit.mockResolvedValue(real);
    const create = vi.fn(() => 'blob:print-ok');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const listeners: Record<string, () => void> = {};
    const printWindow = {
      location: { href: '' },
      addEventListener: vi.fn((type: string, cb: () => void) => (listeners[type] = cb)),
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(printWindow as never);
    renderRow();
    await rowAction(userEvent.setup(), 'Print');
    await vi.waitFor(() => expect(printWindow.location.href).toBe('blob:print-ok'));
    expect(create).toHaveBeenCalledTimes(1);
    expect(listeners.load).toBeTypeOf('function');
    // Not revoked before the window has loaded the PDF.
    expect(revoke).not.toHaveBeenCalled();
    act(() => listeners.load());
    expect(printWindow.print).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:print-ok');
  });
});

describe('T28 editor header Download / Print', () => {
  const header = () => renderWithEditorStore(<InvoiceEditorHeader />);

  it('S5: a double click on Download generates the PDF once', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    header();
    const btn = screen.getByRole('button', { name: /download pdf/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await act(async () => release(kit));
    await vi.waitFor(() => expect(kit.downloadPdf).toHaveBeenCalled());
    expect(kit.generatePdfBlob).toHaveBeenCalledTimes(1);
    expect(kit.downloadPdf).toHaveBeenCalledTimes(1);
  });

  it('S5: the button shows its pending state while the toolkit loads', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    header();
    const btn = screen.getByRole('button', { name: /download pdf/i });
    fireEvent.click(btn);
    await vi.waitFor(() => expect(btn).toBeDisabled());
    await act(async () => release(kit));
    await vi.waitFor(() => expect(btn).toBeEnabled());
  });

  it('S8: typing does not rebuild the document; only Download builds it, once', async () => {
    const { store } = header();
    h.buildSpy.mockClear();
    act(() => store.getState().updateField('notes', 'a'));
    act(() => store.getState().updateField('notes', 'ab'));
    act(() => store.getState().updateField('notes', 'abc'));
    expect(h.buildSpy).not.toHaveBeenCalled();
    act(() => store.setState({ hasUnsavedChanges: false } as never));
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await vi.waitFor(() => expect(kit.downloadPdf).toHaveBeenCalled());
    expect(h.buildSpy).toHaveBeenCalledTimes(1);
  });

  it('D8: a model-building error on editor Download is told and reported', async () => {
    header();
    h.buildFail.on = true;
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toMatch(/could not be prepared/i);
    expect(captureException).toHaveBeenCalled();
  });
});

// editor-ux T41 (review-2026-10-10 r2 N4; AC-01): while a PDF is being prepared the trigger SHOWS and
// ANNOUNCES it - aria-busy plus a status a screen reader reads - not only a disabled button.
describe('T41 the preparing state is visible and announced, then gone', () => {
  const preparing = () => screen.getByRole('status');

  it('row actions (list / dashboard): Download PDF marks the trigger busy and announces "Preparing"', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = renderRow();
    await rowAction(userEvent.setup(), 'Download PDF');
    const trigger = screen.getByRole('button', { name: /actions for/i });
    await vi.waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toHaveTextContent(/preparing/i);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    await act(async () => release(kit));
    await vi.waitFor(() => expect(kit.downloadPdf).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(trigger).not.toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toBeEmptyDOMElement();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('editor header: Download is busy and announced while preparing, then restored', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = renderWithEditorStore(<InvoiceEditorHeader />);
    const btn = screen.getByRole('button', { name: /download pdf/i });
    expect(btn).not.toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toHaveTextContent(/preparing/i);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    await act(async () => release(kit));
    await vi.waitFor(() => expect(btn).not.toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toBeEmptyDOMElement();
  });

  it('editor header: Print is busy and announced while preparing, then restored', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    vi.spyOn(window, 'open').mockReturnValue({ close: vi.fn(), location: { href: '' } } as never);
    renderWithEditorStore(<InvoiceEditorHeader />);
    const btn = screen.getByRole('button', { name: /print/i });
    fireEvent.click(btn);
    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toHaveTextContent(/preparing/i);
    await act(async () => release(kit));
    await vi.waitFor(() => expect(btn).not.toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toBeEmptyDOMElement();
  });

  it('related invoices list: Download marks the trigger busy and announces "Preparing", then clears', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    const listed = { ...invoice, status: 'PENDING', issueDate: '2026-09-01', dueDate: '2026-10-01', customer: { name: 'Acme' } };
    render(
      <RelatedInvoicesList
        invoices={[listed] as never}
        entityType="customer"
        entityId="c1"
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /actions for invoice/i }));
    await user.click(await screen.findByText('Download'));
    const trigger = screen.getByRole('button', { name: /actions for invoice/i });
    await vi.waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toHaveTextContent(/preparing/i);
    await act(async () => release(kit));
    await vi.waitFor(() => expect(trigger).not.toHaveAttribute('aria-busy', 'true'));
    expect(preparing()).toBeEmptyDOMElement();
  });
});

// editor-ux T48 (review-2026-10-10-r3 R1; AC-01): ONE always-mounted polite status region per trigger
// surface, outside every button and menu item, whose text alone changes; and below md the "More actions"
// trigger itself shows the busy state, because the menu closes on select.
describe('T48 the preparing state on the phone editor and the always-mounted status region', () => {
  const region = () => screen.getByRole('status');

  it('desktop: the status region is mounted before preparing, outside every button, and not desktop-only', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    renderWithEditorStore(<InvoiceEditorHeader />);
    const status = region();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
    for (const b of screen.getAllByRole('button')) expect(b).not.toContainElement(status);
    expect(status.closest('.hidden')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await vi.waitFor(() => expect(region()).toHaveTextContent(/preparing/i));
    expect(region()).toBe(status);
    await act(async () => release(kit));
    await vi.waitFor(() => expect(status).toBeEmptyDOMElement());
  });

  it.each([
    ['Download PDF', () => kit.downloadPdf],
    ['Print', () => kit.printPdf],
  ])('phone: %s chosen from "More actions" marks that trigger busy and sets the status text', async (name, done) => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValue(new Promise((r) => (release = r)));
    vi.spyOn(window, 'open').mockReturnValue({ close: vi.fn(), location: { href: '' } } as never);
    const { container } = renderWithEditorStore(<InvoiceEditorHeader />);
    const more = screen.getByRole('button', { name: 'More actions' });
    expect(more).not.toHaveAttribute('aria-busy', 'true');
    const user = userEvent.setup();
    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name }));
    await vi.waitFor(() => expect(more).toHaveAttribute('aria-busy', 'true'));
    expect(region()).toHaveTextContent(/preparing/i);
    expect(more.querySelector('.animate-spin')).not.toBeNull();
    expect(region().closest('.hidden')).toBeNull();
    expect(more).not.toContainElement(region());
    await act(async () => release(kit));
    await vi.waitFor(() => expect(done()).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(more).not.toHaveAttribute('aria-busy', 'true'));
    expect(region()).toBeEmptyDOMElement();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('row actions: the region exists before preparing and is not inside the trigger', () => {
    renderRow();
    const status = region();
    expect(status).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: /actions for/i })).not.toContainElement(status);
  });
});
