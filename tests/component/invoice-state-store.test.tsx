// @vitest-environment jsdom
// T23 (ai-chat-v2; AC-21, AC-23; ADR-0008, ADR-0005) - one workspace invoice-state store: seeded from the page load,
// written by action results, read by the Draft card and every ChatLink, so they always agree. The created Draft card
// gains "Preview" (pushes ?preview={cardId}) and "Open in editor →".
//
// Seams:
//   components/ai/invoice-state-context.tsx -> InvoiceStateProvider({ children }) (an inner provider under an outer
//     one passes through, so the island and the workspace share one store); useInvoiceState(invoiceId) ->
//     LinkedInvoiceState | undefined; useApplyInvoiceState() -> apply(invoiceId, state) (a no-op outside a provider).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { ok } from '@/types/actions';

const createDraftFromCard = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: (...a: unknown[]) => createDraftFromCard(...a),
  loadConversationCards: vi.fn(async () => ({ success: true, data: { cards: {}, invoiceLinks: {}, offers: {} } })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => search,
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));

import { ChatIsland } from '@/components/ai/chat-island';
import { ChatLink } from '@/components/ai/chat-link';
import { DraftCard } from '@/components/ai/draft-card';
import {
  InvoiceStateProvider,
  useApplyInvoiceState,
  useInvoiceState,
} from '@/components/ai/invoice-state-context';
import type { DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';

const DRAFT: LinkedInvoiceState = { state: 'DRAFT', invoiceId: 'inv43', invoiceNumber: 'INV-0043' };
const ISSUED: LinkedInvoiceState = { state: 'ISSUED', invoiceId: 'inv43', invoiceNumber: 'INV-0043', status: 'pending' };
const UNAVAILABLE: LinkedInvoiceState = { state: 'UNAVAILABLE' };

const card = (over: Partial<DraftCardView> = {}): DraftCardView => ({
  id: 'card1',
  state: 'CREATED',
  proposal: {
    customer: { customerId: 'cust1', name: { freelancerText: 'Acme Corp' }, source: 'REQUEST' },
    senderProfile: { senderProfileId: 'sp1', name: { freelancerText: 'Main profile' }, source: 'DEFAULT' },
    bankAccount: { bankAccountId: 'ba1', label: 'Monobank ••••1234', currency: 'USD', source: 'DEFAULT' },
    currency: 'USD',
    issueDate: { value: '2026-10-11', source: 'DEFAULT' },
    dueDate: { value: '2026-11-10', source: 'DEFAULT' },
    lines: [
      {
        name: 'Consulting',
        productId: 'prod1',
        quantity: '20.00',
        unit: 'hours',
        rate: '50.00',
        amount: '1000.00',
        quantitySource: 'REQUEST',
        unitSource: 'REQUEST',
        rateSource: 'REQUEST',
        agreedCustomPrice: null,
      },
    ],
    subtotal: '1000.00',
    total: '1000.00',
    invoiceNumber: null,
    defaultsUsed: [],
  } as DraftCardView['proposal'],
  replacedById: null,
  invoice: DRAFT,
  ...over,
});

let apply!: (invoiceId: string, state: LinkedInvoiceState) => void;
const setApply = (next: typeof apply) => {
  apply = next;
};
function Applier() {
  const writer = useApplyInvoiceState();
  useEffect(() => setApply(writer), [writer]);
  return null;
}
function Reader({ id }: { id: string }) {
  const state = useInvoiceState(id);
  return <output data-testid="reader">{state ? state.state : 'none'}</output>;
}
const pushState = vi.spyOn(window.history, 'pushState');

beforeEach(() => {
  search = new URLSearchParams();
  createDraftFromCard.mockReset();
  pushState.mockClear();
});
afterEach(cleanup);

describe('InvoiceStateProvider', () => {
  it('is empty until something applies a state; apply updates every reader', () => {
    render(
      <InvoiceStateProvider>
        <Applier />
        <Reader id="inv43" />
      </InvoiceStateProvider>
    );
    expect(screen.getByTestId('reader').textContent).toBe('none');
    act(() => apply('inv43', ISSUED));
    expect(screen.getByTestId('reader').textContent).toBe('ISSUED');
  });

  it('an inner provider shares the outer store', () => {
    render(
      <InvoiceStateProvider>
        <Applier />
        <InvoiceStateProvider>
          <Reader id="inv43" />
        </InvoiceStateProvider>
      </InvoiceStateProvider>
    );
    act(() => apply('inv43', UNAVAILABLE));
    expect(screen.getByTestId('reader').textContent).toBe('UNAVAILABLE');
  });

  it('outside a provider, reads are undefined and apply is a no-op', () => {
    render(
      <>
        <Applier />
        <Reader id="inv43" />
      </>
    );
    expect(() => apply('inv43', ISSUED)).not.toThrow();
    expect(screen.getByTestId('reader').textContent).toBe('none');
  });
});

describe('Draft card created states (SCR-05)', () => {
  it('created (draft): "Draft INV-0043 created.", "Open in editor →" and an outline Preview that pushes ?preview={cardId}', async () => {
    render(
      <InvoiceStateProvider>
        <DraftCard card={card()} />
      </InvoiceStateProvider>
    );
    expect(screen.getByText('Draft INV-0043 created.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in editor →' }).getAttribute('href')).toBe('/invoices/inv43/edit');
    const preview = screen.getByRole('button', { name: 'Preview' });
    expect(preview.getAttribute('aria-expanded')).toBe('false');
    await userEvent.setup().click(preview);
    expect(pushState).toHaveBeenCalled();
    const url = String(pushState.mock.calls[pushState.mock.calls.length - 1][2]);
    expect(url).toMatch(/\?preview=card1$/);
  });

  it('preview open: Preview is aria-expanded and secondary', () => {
    search = new URLSearchParams('preview=card1');
    render(
      <InvoiceStateProvider>
        <DraftCard card={card()} />
      </InvoiceStateProvider>
    );
    const preview = screen.getByRole('button', { name: 'Preview' });
    expect(preview.getAttribute('aria-expanded')).toBe('true');
    expect(preview.getAttribute('data-variant')).toBe('secondary');
  });

  it('a card that is not created has no Preview', () => {
    render(
      <InvoiceStateProvider>
        <DraftCard card={card({ state: 'LIVE', invoice: null })} />
      </InvoiceStateProvider>
    );
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
  });
});

describe('Card and links agree (AC-23, AC-21)', () => {
  const link = { kind: 'invoice' as const, invoiceId: 'inv43', label: 'INV-0043' };
  function scene() {
    return render(
      <InvoiceStateProvider>
        <Applier />
        <DraftCard card={card()} />
        <div data-testid="link-with-load-state">
          <ChatLink link={link} state={DRAFT} />
        </div>
        <div data-testid="link-without-state">
          <ChatLink link={link} />
        </div>
      </InvoiceStateProvider>
    );
  }

  it('AC-23: an applied ISSUED shows the card as issued and every link with its status; Preview and the editor link stay', () => {
    scene();
    act(() => apply('inv43', ISSUED));
    expect(screen.getByText(/Invoice INV-0043/)).toBeTruthy();
    expect(screen.queryByText('Draft INV-0043 created.')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open in editor →' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
    for (const id of ['link-with-load-state', 'link-without-state']) {
      const box = screen.getByTestId(id);
      expect(box.textContent).not.toContain('Draft');
      expect(box.textContent).toContain('Pending');
    }
  });

  it('AC-21: an applied UNAVAILABLE shows "This draft is no longer available." with no link and no Preview, and the links agree', () => {
    scene();
    act(() => apply('inv43', UNAVAILABLE));
    expect(screen.getByText('This draft is no longer available.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open in editor →' })).toBeNull();
    for (const id of ['link-with-load-state', 'link-without-state']) {
      expect(screen.getByTestId(id).textContent).toContain('INV-0043 · No longer available');
      expect(screen.getByTestId(id).querySelector('a')).toBeNull();
    }
  });

  it('a createDraftFromCard result is written to the store, so a link with no state shows the draft', async () => {
    createDraftFromCard.mockResolvedValue(ok({ kind: 'CREATED', invoiceId: 'inv43', invoiceNumber: 'INV-0043' }));
    render(
      <InvoiceStateProvider>
        <DraftCard card={card({ state: 'LIVE', invoice: null })} />
        <ChatLink link={link} />
      </InvoiceStateProvider>
    );
    expect(screen.queryByRole('link', { name: /INV-0043 · Draft/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByRole('link', { name: /INV-0043 · Draft/ })).toBeTruthy();
  });
});

describe('ChatIsland seeds the store from the page load (ADR-0008)', () => {
  it('the load states seed the shared store; a later apply updates the island card and links together', async () => {
    render(
      <InvoiceStateProvider>
        <Applier />
        <Reader id="inv43" />
        <ChatIsland
          conversationId="c1"
          initialMessages={[
            { id: 'm1', role: 'user', origin: 'TYPED', parts: [{ type: 'text', text: 'invoice Acme' }], createdAt: '' },
            {
              id: 'm2',
              role: 'assistant',
              origin: null,
              parts: [
                { type: 'text', text: 'Here it is.' },
                { type: 'data-draft-card', id: 'card1', data: { cardId: 'card1' } },
                { type: 'data-link', data: { kind: 'invoice', invoiceId: 'inv43', label: 'INV-0043' } },
              ],
              createdAt: '',
            },
          ]}
          invoiceLinks={{ inv43: DRAFT }}
          cards={{ card1: card() }}
          allowance={{ limit: 30, used: 1, left: 29, renewsAt: '2026-10-14T00:00:00.000Z', timeZone: 'UTC' }}
        />
      </InvoiceStateProvider>
    );
    await waitFor(() => expect(screen.getByTestId('reader').textContent).toBe('DRAFT'));
    expect(screen.getByRole('link', { name: /INV-0043 · Draft/ })).toBeTruthy();
    act(() => apply('inv43', ISSUED));
    expect(screen.queryByRole('link', { name: /INV-0043 · Draft/ })).toBeNull();
    expect(screen.queryByText('Draft INV-0043 created.')).toBeNull();
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(2);
  });
});
