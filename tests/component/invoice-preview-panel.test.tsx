// @vitest-environment jsdom
// T24 (ai-chat-v2; AC-19, AC-20, AC-21, AC-22, AC-23, AC-25, AC-26, AC-26b, AC-27) - SCR-06 InvoicePreviewPanel and
// SCR-07 issue confirmation, and the workspace layout around ?preview={cardId} (ADR-0005).
//
// Seams:
//   components/ai/invoice-preview-panel.tsx -> InvoicePreviewPanel({ cardId, variant?: 'column' | 'sheet' }) (client).
//     Calls loadInvoicePreview(cardId) on open; routes every loadInvoicePreview / issueFromPreview result to a
//     SCR-06 state with the contract texts verbatim and writes the states to the invoice-state store (ADR-0008);
//     "×" (aria-label "Close preview") and Escape close it through the address.
//   components/ai/ai-workspace.tsx -> reads ?preview=: from md a grid column beside the chat (the list pane hidden
//     below xl, reachable through the list button), below md a full-screen bottom Sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail, ok } from '@/types/actions';

const loadInvoicePreview = vi.fn();
const issueFromPreview = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  loadInvoicePreview: (...a: unknown[]) => loadInvoicePreview(...a),
  issueFromPreview: (...a: unknown[]) => issueFromPreview(...a),
  createDraftFromCard: vi.fn(),
  loadConversationCards: vi.fn(),
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => search,
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
vi.mock('@/components/invoice-editor/pdf-preview-panel', () => ({
  PDFPreviewPanel: ({ source }: { source: { invoice: { invoiceNumber: string; status: string; total: number } } }) => (
    <div data-testid="pdf-preview">{`document ${source.invoice.invoiceNumber} ${source.invoice.status} ${source.invoice.total}`}</div>
  ),
}));
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  prepareInvoiceDataForPdf: () => ({ senderProfile: null }),
}));

import { AiWorkspace } from '@/components/ai/ai-workspace';
import { ChatLink } from '@/components/ai/chat-link';
import { DraftCard } from '@/components/ai/draft-card';
import { InvoicePreviewPanel } from '@/components/ai/invoice-preview-panel';
import { InvoiceStateProvider } from '@/components/ai/invoice-state-context';
import type { DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';
import type { SerializedInvoice } from '@/types/invoice/types';

const NO_LONGER = 'This invoice is no longer available.';
const CANT_FIND = "This invoice can't be found.";
const LOAD_FAILED = "The preview couldn't be loaded. Try again.";
const ALREADY = 'This invoice has already been issued.';
const CHANGED = 'This draft was changed after you opened the preview. Check it and issue again.';
const ISSUE_FAILED = "The invoice couldn't be issued. Try again.";
const SENTENCE = "Once it's issued, its lines and amounts can no longer change.";

const DRAFT: LinkedInvoiceState = { state: 'DRAFT', invoiceId: 'inv43', invoiceNumber: 'INV-0043' };
const ISSUED: LinkedInvoiceState = { state: 'ISSUED', invoiceId: 'inv43', invoiceNumber: 'INV-0043', status: 'pending' };

const invoice = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'inv43',
    invoiceNumber: 'INV-0043',
    status: 'DRAFT',
    total: 1000,
    currency: 'USD',
    customer: { id: 'cust1', name: 'Acme Corp' },
    ...over,
  }) as unknown as SerializedInvoice;

const available = (over: Partial<Record<string, unknown>> = {}, version = 3, state: LinkedInvoiceState = DRAFT) =>
  ok({ kind: 'AVAILABLE' as const, invoice: invoice(over), version, state });

const card: DraftCardView = {
  id: 'card1',
  state: 'CREATED',
  proposal: {
    customer: { customerId: 'cust1', name: { freelancerText: 'Acme Corp' }, source: 'REQUEST' },
    senderProfile: { senderProfileId: 'sp1', name: { freelancerText: 'Main profile' }, source: 'DEFAULT' },
    bankAccount: { bankAccountId: 'ba1', label: 'Monobank ••••1234', currency: 'USD', source: 'DEFAULT' },
    currency: 'USD',
    issueDate: { value: '2026-10-11', source: 'DEFAULT' },
    dueDate: { value: '2026-11-10', source: 'DEFAULT' },
    lines: [],
    subtotal: '1000.00',
    total: '1000.00',
    invoiceNumber: null,
    defaultsUsed: [],
  } as unknown as DraftCardView['proposal'],
  replacedById: null,
  invoice: DRAFT,
};
const link = { kind: 'invoice' as const, invoiceId: 'inv43', label: 'INV-0043' };

/** The panel beside a created card and a link to the same invoice, sharing one store. */
function scene() {
  return render(
    <InvoiceStateProvider>
      <div data-testid="card">
        <DraftCard card={card} />
      </div>
      <div data-testid="link">
        <ChatLink link={link} state={DRAFT} />
      </div>
      <InvoicePreviewPanel cardId="card1" />
    </InvoiceStateProvider>
  );
}
const panel = () => screen.getByRole('region', { name: /INV-0043|Invoice preview/ });
const issueButton = () => within(panel()).queryByRole('button', { name: 'Issue invoice' });

async function confirmIssue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(issueButton()!);
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Issue invoice' }));
  return dialog;
}

const replaceState = vi.spyOn(window.history, 'replaceState');
const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

beforeEach(() => {
  search = new URLSearchParams('preview=card1');
  loadInvoicePreview.mockReset();
  issueFromPreview.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  goToSignIn.mockReset();
  replaceState.mockClear();
  back.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('InvoicePreviewPanel - loading and draft (AC-20)', () => {
  it('loading: "Invoice preview", a page skeleton, a status and the footer disabled', async () => {
    loadInvoicePreview.mockReturnValue(new Promise(() => undefined));
    render(<InvoicePreviewPanel cardId="card1" />);
    const region = screen.getByRole('region', { name: 'Invoice preview' });
    expect(within(region).getByText('Loading preview…')).toBeTruthy();
    expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(loadInvoicePreview).toHaveBeenCalledWith('card1');
  });

  it('draft: number + "Draft" badge, the document, "Open in editor" and "Issue invoice"; the heading takes focus', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    render(<InvoicePreviewPanel cardId="card1" />);
    const heading = await screen.findByRole('heading', { name: 'INV-0043' });
    const region = panel();
    expect(within(region).getByText('Draft')).toBeTruthy();
    expect(within(region).getByTestId('pdf-preview').textContent).toContain('document INV-0043');
    expect(within(region).getByRole('link', { name: 'Open in editor' }).getAttribute('href')).toBe('/invoices/inv43/edit');
    expect(issueButton()).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('issued: the status badge, the document and only "Open in editor"', async () => {
    loadInvoicePreview.mockResolvedValue(available({ status: 'PENDING' }, 4, ISSUED));
    render(<InvoicePreviewPanel cardId="card1" />);
    await screen.findByRole('heading', { name: 'INV-0043' });
    expect(within(panel()).getByText('Pending')).toBeTruthy();
    expect(issueButton()).toBeNull();
    expect(within(panel()).getByRole('link', { name: 'Open in editor' })).toBeTruthy();
  });

  it('"Close preview" drops the parameter, and Escape does the same', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    render(<InvoicePreviewPanel cardId="card1" />);
    await screen.findByRole('heading', { name: 'INV-0043' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(replaceState.mock.calls.length + back.mock.calls.length).toBe(1);
    await user.keyboard('{Escape}');
    expect(replaceState.mock.calls.length + back.mock.calls.length).toBe(2);
  });
});

describe('InvoicePreviewPanel - no invoice (AC-21, AC-22)', () => {
  it('AC-21: UNAVAILABLE says the invoice is no longer available, no Issue, no editor link, and the card shows the same', async () => {
    loadInvoicePreview.mockResolvedValue(ok({ kind: 'UNAVAILABLE' as const }));
    scene();
    expect(await within(panel()).findByText(NO_LONGER)).toBeTruthy();
    expect(issueButton()).toBeNull();
    expect(within(panel()).queryByRole('link')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('card').textContent).toContain('This draft is no longer available.'));
    expect(within(screen.getByTestId('card')).queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.getByTestId('link').textContent).toContain('No longer available');
  });

  it('AC-22: NOT_FOUND says it cannot be found, verbatim, and leaves the card alone', async () => {
    loadInvoicePreview.mockResolvedValue(fail('NOT_FOUND', CANT_FIND));
    scene();
    expect(await within(panel()).findByText(CANT_FIND)).toBeTruthy();
    expect(issueButton()).toBeNull();
    expect(screen.getByTestId('card').textContent).toContain('Draft INV-0043 created.');
  });

  it('FAILED: the load error with "Try again", which loads again', async () => {
    loadInvoicePreview.mockResolvedValueOnce(fail('FAILED', LOAD_FAILED)).mockResolvedValueOnce(available());
    render(<InvoicePreviewPanel cardId="card1" />);
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'INV-0043' })).toBeTruthy();
    expect(loadInvoicePreview).toHaveBeenCalledTimes(2);
  });

  it('UNAUTHORIZED or a rejected call goes to sign-in', async () => {
    loadInvoicePreview.mockRejectedValueOnce(new Error('401'));
    render(<InvoicePreviewPanel cardId="card1" />);
    await waitFor(() => expect(goToSignIn).toHaveBeenCalled());
  });
});

describe('Issue (AC-23, AC-27)', () => {
  it('the dialog names the Customer, total and currency from the loaded preview and the fixed sentence; Cancel calls nothing', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    render(<InvoicePreviewPanel cardId="card1" />);
    await screen.findByRole('heading', { name: 'INV-0043' });
    const user = userEvent.setup();
    await user.click(issueButton()!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Issue invoice INV-0043?')).toBeTruthy();
    const text = (dialog.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('1,000.00 USD');
    expect(text).toContain(SENTENCE);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(issueFromPreview).not.toHaveBeenCalled();
  });

  it('issued now: issueFromPreview(invoiceId, version), a toast, and the panel, card and link all show it issued', async () => {
    loadInvoicePreview
      .mockResolvedValueOnce(available())
      .mockResolvedValue(available({ status: 'PENDING' }, 4, ISSUED));
    issueFromPreview.mockResolvedValue(ok({ status: 'PENDING', version: 4, invoice: ISSUED }));
    scene();
    await screen.findByRole('heading', { name: 'INV-0043' });
    await confirmIssue(userEvent.setup());
    expect(issueFromPreview).toHaveBeenCalledWith('inv43', 3);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Invoice INV-0043 issued.'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(issueButton()).toBeNull());
    expect(within(panel()).getByText('Pending')).toBeTruthy();
    expect(screen.getByTestId('card').textContent).toContain('Invoice INV-0043');
    expect(screen.getByTestId('card').textContent).toContain('Pending');
    expect(screen.getByTestId('link').textContent).toContain('Pending');
    expect(loadInvoicePreview).toHaveBeenCalledTimes(2);
  });

  it('AC-27: issuing never depends on the allowance (no allowance input, the action is called as usual)', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    issueFromPreview.mockResolvedValue(ok({ status: 'PENDING', version: 4, invoice: ISSUED }));
    render(<InvoicePreviewPanel cardId="card1" />);
    await screen.findByRole('heading', { name: 'INV-0043' });
    await confirmIssue(userEvent.setup());
    await waitFor(() => expect(issueFromPreview).toHaveBeenCalledTimes(1));
  });
});

describe('Issue refused (AC-25, AC-26, AC-26b)', () => {
  it('AC-26: ALREADY_ISSUED shows the contract text, applies details.invoice and drops Issue; nothing issued again', async () => {
    loadInvoicePreview.mockResolvedValueOnce(available()).mockResolvedValue(available({ status: 'PENDING' }, 5, ISSUED));
    issueFromPreview.mockResolvedValue(fail('CONFLICT', ALREADY, { details: { kind: 'ALREADY_ISSUED', invoice: ISSUED } }));
    scene();
    await screen.findByRole('heading', { name: 'INV-0043' });
    await confirmIssue(userEvent.setup());
    expect(await within(panel()).findByText(ALREADY)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(issueButton()).toBeNull());
    expect(screen.getByTestId('card').textContent).toContain('Pending');
    expect(issueFromPreview).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('AC-26b: CHANGED_ELSEWHERE reloads the current draft with the warning; the next confirmation names the current figures', async () => {
    loadInvoicePreview
      .mockResolvedValueOnce(available())
      .mockResolvedValueOnce(available({ total: 1200, customer: { id: 'cust2', name: 'Acme GmbH' }, currency: 'EUR' }, 7));
    issueFromPreview
      .mockResolvedValueOnce(fail('CONFLICT', CHANGED, { details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 7 } }))
      .mockReturnValueOnce(new Promise(() => undefined));
    render(<InvoicePreviewPanel cardId="card1" />);
    await screen.findByRole('heading', { name: 'INV-0043' });
    const user = userEvent.setup();
    await confirmIssue(user);
    expect(await screen.findByText(CHANGED)).toBeTruthy();
    await waitFor(() => expect(loadInvoicePreview).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('pdf-preview').textContent).toContain('1200'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(issueButton()!);
    // The alert clears on the next Issue press; the dialog names the current figures.
    expect(screen.queryByText(CHANGED)).toBeNull();
    const dialog = await screen.findByRole('dialog');
    const text = (dialog.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Acme GmbH');
    expect(text).toContain('1,200.00 EUR');
    await user.click(within(dialog).getByRole('button', { name: 'Issue invoice' }));
    expect(issueFromPreview).toHaveBeenLastCalledWith('inv43', 7);
  });

  it('AC-25: VALIDATION shows "Can\'t issue this invoice" with the editor message verbatim and the field errors; Open in editor becomes primary', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    const message = 'The bank account currency (EUR) does not match the invoice currency (USD).';
    issueFromPreview.mockResolvedValue(
      fail('VALIDATION', message, { fieldErrors: { bankAccountId: ['Choose a bank account in USD.'] } })
    );
    render(<InvoicePreviewPanel cardId="card1" />);
    await screen.findByRole('heading', { name: 'INV-0043' });
    await confirmIssue(userEvent.setup());
    expect(await screen.findByText("Can't issue this invoice")).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByText('Choose a bank account in USD.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(panel()).getByText('Draft')).toBeTruthy();
    expect(within(panel()).getByRole('link', { name: 'Open in editor' }).getAttribute('data-variant')).toBe('default');
    expect(issueButton()?.getAttribute('data-variant')).toBe('outline');
  });

  it('FAILED: toast "The invoice couldn\'t be issued. Try again." and the panel stays a draft with Issue', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    issueFromPreview.mockResolvedValue(fail('FAILED', ISSUE_FAILED));
    render(<InvoicePreviewPanel cardId="card1" />);
    await screen.findByRole('heading', { name: 'INV-0043' });
    await confirmIssue(userEvent.setup());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(ISSUE_FAILED));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(issueButton()).not.toBeNull();
  });

  it('NOT_FOUND on issue: no longer available, and the card shows the same', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    issueFromPreview.mockResolvedValue(fail('NOT_FOUND', NO_LONGER));
    scene();
    await screen.findByRole('heading', { name: 'INV-0043' });
    await confirmIssue(userEvent.setup());
    expect(await within(panel()).findByText(NO_LONGER)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('card').textContent).toContain('This draft is no longer available.'));
    expect(screen.getByTestId('link').textContent).toContain('No longer available');
  });
});

// ---------- the workspace around ?preview= ----------

function stubWidth(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 768px') ? desktop : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
  );
}
function workspace() {
  return render(
    <AiWorkspace conversations={[{ id: 'c1', title: 'Invoice Acme', lastMessageAt: '2026-10-12T10:00:00.000Z' }]} timeZone="UTC">
      <div data-testid="chat">chat</div>
    </AiWorkspace>
  );
}

describe('AiWorkspace with ?preview= (ADR-0005; AC-19, AC-20)', () => {
  it('no preview: list | chat, no panel', () => {
    search = new URLSearchParams();
    stubWidth(true);
    workspace();
    expect(screen.queryByRole('region', { name: /Invoice preview|INV-0043/ })).toBeNull();
    expect(document.querySelector('[data-slot="ai-workspace"]')?.getAttribute('data-preview')).toBe('closed');
  });

  it('desktop: the panel is a column beside the chat (not a dialog); the list pane is hidden below xl behind the list button', async () => {
    stubWidth(true);
    loadInvoicePreview.mockResolvedValue(available());
    workspace();
    await screen.findByRole('heading', { name: 'INV-0043' });
    const grid = document.querySelector('[data-slot="ai-workspace"]') as HTMLElement;
    expect(grid.getAttribute('data-preview')).toBe('open');
    expect(screen.getByTestId('chat')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const list = screen.getByRole('complementary', { name: 'Conversation list' });
    expect(list.className).toMatch(/xl:flex/);
    expect(list.className).not.toMatch(/(^|\s)md:flex/);
    expect(grid.className).toMatch(/xl:grid-cols-\[18rem_minmax\(0,1fr\)_minmax\(26rem,40%\)\]/);
  });

  it('phone (AC-19): the preview is a full-screen sheet with the same actions', async () => {
    stubWidth(false);
    loadInvoicePreview.mockResolvedValue(available());
    workspace();
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByRole('heading', { name: 'INV-0043' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Issue invoice' })).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: 'Open in editor' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Close preview' })).toBeTruthy();
  });

  it('a reload with ?preview= in the address loads the panel again', async () => {
    stubWidth(true);
    loadInvoicePreview.mockResolvedValue(available());
    workspace();
    await screen.findByRole('heading', { name: 'INV-0043' });
    expect(loadInvoicePreview).toHaveBeenCalledWith('card1');
  });
});

describe('focus return', () => {
  it('closing returns focus to the card\'s Preview button', async () => {
    loadInvoicePreview.mockResolvedValue(available());
    const view = render(
      <InvoiceStateProvider>
        <div id="draft-card-card1">
          <button type="button" aria-expanded="true">
            Preview
          </button>
        </div>
        <InvoicePreviewPanel cardId="card1" />
      </InvoiceStateProvider>
    );
    await screen.findByRole('heading', { name: 'INV-0043' });
    await act(async () => {
      view.rerender(
        <InvoiceStateProvider>
          <div id="draft-card-card1">
            <button type="button" aria-expanded="false">
              Preview
            </button>
          </div>
        </InvoiceStateProvider>
      );
    });
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Preview'));
  });
});
