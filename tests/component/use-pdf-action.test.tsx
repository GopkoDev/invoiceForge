// @vitest-environment jsdom
// editor-ux T2 (ADR-0001; AC-01, AC-02, AC-02b; sad §6 flow 2, §7 "PDF failures"): every PDF trigger
// goes through usePdfAction, which owns the preparing / try-again / newer-version states.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { toast, captureException, loadPdfKit, kit } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  captureException: vi.fn(),
  loadPdfKit: vi.fn(),
  kit: {
    InvoicePDFDocument: () => null,
    InvoicePdfDocument: () => null,
    generatePdfBlob: vi.fn(),
    downloadPdf: vi.fn(),
    printPdf: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast }));
vi.mock('@sentry/nextjs', () => ({ captureException }));
vi.mock('@/lib/pdf/load-pdf-kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/load-pdf-kit')>()),
  loadPdfKit,
}));
// Never load the real toolkit (or the temporary shims that import it) in this test.
vi.mock('@/lib/pdf/invoice-pdf-kit', () => kit);
vi.mock('@/lib/utils/image-to-base64', () => ({ fetchLogoDataUrl: vi.fn() }));
vi.mock('@/lib/helpers/client-session-redirect', () => ({ goToSignIn: vi.fn() }));

const { PdfKitLoadError } = await import('@/lib/pdf/load-pdf-kit');
const { usePdfAction } = await import('@/hooks/use-pdf-action');

type Invoice = Parameters<ReturnType<typeof usePdfAction>['run']>[1];

const invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-0001',
  status: 'SENT',
  senderProfileId: 's1',
  customerId: 'c1',
  bankAccountId: 'b1',
  issueDate: new Date('2026-09-01T00:00:00.000Z'),
  dueDate: new Date('2026-10-01T00:00:00.000Z'),
  currency: 'USD',
  items: [],
  subtotal: 100,
  taxAmount: 0,
  total: 100,
  taxRate: 0,
  discount: 0,
  shipping: 0,
  senderProfile: { logo: null },
} as unknown as Invoice;

function Harness() {
  const { run, preparing } = usePdfAction();
  return (
    <div>
      <button onClick={() => void run('download', invoice)}>Download</button>
      <button onClick={() => void run('print', invoice)}>Print</button>
      <span data-testid="state">{preparing ? 'preparing' : 'idle'}</span>
    </div>
  );
}

const blob = new Blob(['pdf']);

beforeEach(() => {
  vi.clearAllMocks();
  loadPdfKit.mockResolvedValue(kit);
  kit.generatePdfBlob.mockResolvedValue(blob);
  // The print window is opened in the click (T28); a stub window stands in for it.
  vi.spyOn(window, 'open').mockReturnValue({ close: vi.fn() } as unknown as Window);
});

describe('usePdfAction (T2)', () => {
  it('AC-01: shows preparing while the toolkit is fetched, then downloads that invoice', async () => {
    let release!: (k: typeof kit) => void;
    loadPdfKit.mockReturnValueOnce(new Promise((r) => (release = r)));
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Download'));
    expect(screen.getByTestId('state').textContent).toBe('preparing');
    expect(kit.downloadPdf).not.toHaveBeenCalled();

    await act(async () => release(kit));
    expect(screen.getByTestId('state').textContent).toBe('idle');
    expect(kit.downloadPdf).toHaveBeenCalledWith(blob, expect.stringContaining('INV-0001'));
  });

  it('AC-01: Print hands the generated PDF to the print path', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByText('Print'));
    await vi.waitFor(() => expect(kit.printPdf).toHaveBeenCalledWith(blob, expect.anything()));
    expect(kit.downloadPdf).not.toHaveBeenCalled();
  });

  it('AC-01: a second action in the same visit goes through loadPdfKit again (cached there), never a new import', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Download'));
    await vi.waitFor(() => expect(kit.downloadPdf).toHaveBeenCalledTimes(1));
    await user.click(screen.getByText('Print'));
    await vi.waitFor(() => expect(kit.printPdf).toHaveBeenCalledTimes(1));
    // The hook must only ever obtain the kit via the cached loader, not import it itself.
    expect(loadPdfKit).toHaveBeenCalledTimes(2);
  });

  it('AC-02: offline shows a plain-language message with Try again; trying again produces the PDF', async () => {
    loadPdfKit.mockRejectedValueOnce(new PdfKitLoadError('offline'));
    render(<Harness />);
    await userEvent.setup().click(screen.getByText('Download'));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    const [message, options] = toast.error.mock.calls[0];
    expect(message).toMatch(/could not be prepared/i);
    expect(options.action.label).toMatch(/try again/i);
    expect(screen.getByTestId('state').textContent).toBe('idle');
    expect(kit.downloadPdf).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: { 'pdf.stage': 'fetch' } })
    );

    await act(async () => options.action.onClick());
    await vi.waitFor(() => expect(kit.downloadPdf).toHaveBeenCalledWith(blob, expect.any(String)));
  });

  it('AC-02b: a missing toolkit after an update offers Reload, never Try again', async () => {
    loadPdfKit.mockRejectedValueOnce(new PdfKitLoadError('new-version'));
    render(<Harness />);
    await userEvent.setup().click(screen.getByText('Download'));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    const [message, options] = toast.error.mock.calls[0];
    expect(message).toMatch(/newer version/i);
    expect(options.action.label).toMatch(/reload/i);
    expect(options.action.label).not.toMatch(/try again/i);
    expect(message).not.toMatch(/try again/i);
  });

  it('AC-02b: reload action reloads the page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    loadPdfKit.mockRejectedValueOnce(new PdfKitLoadError('new-version'));
    render(<Harness />);
    await userEvent.setup().click(screen.getByText('Download'));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    toast.error.mock.calls[0][1].action.onClick();
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('AC-02b: a generation failure reports to Sentry with pdf.stage=generate and offers Try again', async () => {
    const boom = new Error('layout exploded');
    kit.generatePdfBlob.mockRejectedValueOnce(boom);
    render(<Harness />);
    await userEvent.setup().click(screen.getByText('Download'));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ tags: expect.objectContaining({ 'pdf.stage': 'generate' }) })
    );
    const [message, options] = toast.error.mock.calls[0];
    expect(message).toMatch(/could not be prepared/i);
    expect(options.action.label).toMatch(/try again/i);
    expect(kit.downloadPdf).not.toHaveBeenCalled();
    expect(screen.getByTestId('state').textContent).toBe('idle');
  });
});
