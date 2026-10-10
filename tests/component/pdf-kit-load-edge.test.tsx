// @vitest-environment jsdom
// editor-ux T28 (test-plan.md AC-02 / AC-02b edge cases): failure classification is shared, and a
// captive portal is reported with its stage and offers a next step. Real loader; the toolkit chunk fails to load.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  captureException: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@sentry/nextjs', () => ({ captureException: h.captureException }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/pdf/invoice-pdf-kit', () => {
  throw new Error('Loading chunk failed');
});
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: vi.fn(),
  duplicateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  updateInvoice: vi.fn(),
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-1' }),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));
vi.mock('@/lib/utils/image-to-base64', () => ({ fetchLogoDataUrl: vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.getAnimations = () => [];

const { renderWithEditorStore } = await import('../support/render-with-editor-store');
const { InvoiceEditorHeader } = await import('@/components/invoice-editor/invoice-editor-header');

beforeEach(() => vi.clearAllMocks());

describe('T28 toolkit failure classification', () => {
  it('Download during the idle warm-up classification: one probe, one message', async () => {
    // The warm-up runs at once, the Freelancer clicks while its failure is still being classified.
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => (cb(), 1));
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    let answer!: (r: unknown) => void;
    const probe = vi.fn(() => new Promise((r) => (answer = r)));
    vi.stubGlobal('fetch', probe);

    renderWithEditorStore(<InvoiceEditorHeader />);
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    await act(async () => {
      answer({ ok: true, status: 200, type: 'basic' });
    });
    await vi.waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(probe).toHaveBeenCalledTimes(1);
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(h.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ 'pdf.stage': 'version' }) })
    );
  });

  it('an offline toolkit fetch is reported with pdf.stage=fetch', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.stubGlobal('cancelIdleCallback', undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderWithEditorStore(<InvoiceEditorHeader />);
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await vi.waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast.error.mock.calls[0][1].action.label).toMatch(/try again/i);
    expect(h.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ 'pdf.stage': 'fetch' }) })
    );
  });

  it('a captive portal answering the probe is reported with its stage version (T45), and the page stays usable with a next step offered', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.stubGlobal('cancelIdleCallback', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        redirected: true,
        url: 'http://captive.portal.example/login',
        headers: new Headers({ 'content-type': 'text/html' }),
      })
    );
    renderWithEditorStore(<InvoiceEditorHeader />);
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await vi.waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    // test-plan / sad §11 define no portal detection: the plan is a usable page, a next step
    // (Try again or Reload) and a Sentry report carrying its stage.
    const [, options] = h.toast.error.mock.calls[0];
    expect(options.action.label).toMatch(/try again|reload/i);
    expect(h.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: expect.objectContaining({ 'pdf.stage': 'version' }) })
    );
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeEnabled();
  });
});
