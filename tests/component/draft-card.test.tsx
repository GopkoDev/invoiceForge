// @vitest-environment jsdom
// T28 (ai-assistant; AC-11c, AC-12, AC-13, AC-14, AC-14b, AC-16, AC-16b, AC-18, AC-19) - SCR-03 Draft card in
// every state, Create wired to createDraftFromCard, and the /ai/[conversationId] page rendering it in the card slot.
// See docs/features/ai-assistant/tasks/t28-draft-card-component.md and screens.md §SCR-03.
//
// Seams the implementer must provide:
//   components/ai/draft-card.tsx -> 'use client'; export function DraftCard(props: { card: DraftCardView })
//     The component calls createDraftFromCard(card.id) itself (lib/actions/assistant-actions, mocked here).
//     Its root element has id="draft-card-{card.id}" (the scroll target of "Go to the newer card ↓").
//     State is local: after a result the card re-renders per the SCR-03 table; an OUTDATED result renders the
//     returned card (a second DraftCard) directly under the collapsed one.
//   app/(protected)/ai/[conversationId]/page.tsx -> MessageList renderCard={(id) => cards[id] ? <DraftCard card/> :
//     a card-sized Skeleton (data-slot="skeleton")} (SCR-03 loading, OQ-S1).
//   Copy is from screens.md §SCR-03 verbatim. Dates: the day as the repo formats days (formatDay: "Oct 11, 2026")
//   or the wireframe's "11 Oct 2026" - both accepted below.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail, ok } from '@/types/actions';

const createDraftFromCard = vi.fn();
vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: (...a: unknown[]) => createDraftFromCard(...a),
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const getConversation = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  getConversation: (...a: unknown[]) => getConversation(...a),
  // T40 (R-20): the conversation page also reads the list column.
  listConversationSummaries: async () => ({
    success: true,
    data: { items: [], timeZone: 'UTC' },
  }),
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({
    success: true,
    data: { userId: 'u1', timeZone: 'UTC' },
  }),
}));
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: async () => ({
    success: true,
    data: {
      limit: 30,
      used: 30,
      left: 0,
      renewsAt: '2026-10-13T00:00:00.000Z',
      timeZone: 'UTC',
    },
  }),
}));

import { DraftCard } from '@/components/ai/draft-card';
import ConversationPage from '@/app/(protected)/ai/[conversationId]/page';
import type { DraftCardView } from '@/types/assistant/types';

type Proposal = DraftCardView['proposal'];
type Line = Proposal['lines'][number];

const SIGN_IN = '/api/auth/clear-session';
const assignMock = vi.fn();
const scrollIntoView = vi.fn();

const line = (over: Partial<Line> = {}): Line => ({
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
  ...over,
});

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  customer: {
    customerId: 'cust1',
    name: { freelancerText: 'Acme Corp' },
    source: 'REQUEST',
  },
  senderProfile: {
    senderProfileId: 'sp1',
    name: { freelancerText: 'Main profile' },
    source: 'DEFAULT',
  },
  bankAccount: {
    bankAccountId: 'ba1',
    label: 'Monobank ••••1234',
    currency: 'USD',
    source: 'DEFAULT',
  },
  currency: 'USD',
  issueDate: { value: '2026-10-11', source: 'DEFAULT' },
  dueDate: { value: '2026-11-10', source: 'DEFAULT' },
  lines: [line()],
  subtotal: '1000.00',
  total: '1000.00',
  invoiceNumber: null,
  defaultsUsed: ['senderProfile', 'bankAccount', 'issueDate', 'dueDate'],
  ...over,
});

const card = (over: Partial<DraftCardView> = {}): DraftCardView => ({
  id: 'card1',
  state: 'LIVE',
  proposal: proposal(),
  replacedById: null,
  invoice: null,
  ...over,
});

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
const createBtn = () => screen.queryByRole('button', { name: 'Create draft' });

beforeEach(() => {
  createDraftFromCard.mockReset();
  toastError.mockReset();
  assignMock.mockReset();
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign: assignMock },
  });
});
afterEach(cleanup);

describe('DraftCard - live content (AC-12, AC-16, AC-16b, AC-19)', () => {
  it('AC-12: shows customer, sender and bank as defaults, dates, the 20 x 50.00 line, total and the Create button', () => {
    const { container } = render(<DraftCard card={card()} />);
    const t = text(container);
    expect(t).toContain('Draft invoice');
    expect(t).toContain('Acme Corp');
    expect(t).toContain('Main profile (default)');
    expect(t).toContain('Monobank ••••1234 · USD (default)');
    expect(t).toMatch(/(11 Oct 2026|Oct 11, 2026) \(today, default\)/);
    expect(t).toMatch(/(10 Nov 2026|Nov 10, 2026) \(in 30 days, default\)/);
    expect(t).toContain('Consulting 20 hours × 50.00 = 1,000.00 USD');
    expect(t).toContain('Total 1,000.00 USD');
    expect(t).toContain(
      'No tax, discount or shipping. The invoice number is assigned when the draft is created.'
    );
    expect(t).toContain(
      'Defaults used: sender profile, bank account, issue date, due date.'
    );
    expect(createBtn()).toBeEnabled();
    expect(screen.queryByText('Created')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // ai-chat-v2 T38 (ADR-0010, SCR-05): the card spans the message column, rounded-xl with the container's border colour.
  it('spans the column as a rounded-xl card in the border colour, without its own shadow', () => {
    const { container } = render(<DraftCard card={card()} />);
    const el = container.querySelector('[data-slot="card"]') as HTMLElement;
    expect(el).toHaveClass(
      'w-full',
      'rounded-xl',
      'ring-border',
      'shadow-none'
    );
  });

  it('hides "Defaults used" when nothing was defaulted and labels explicit sender and bank choices', () => {
    const p = proposal({
      senderProfile: {
        senderProfileId: 'sp1',
        name: { freelancerText: 'Side profile' },
        source: 'REQUEST',
      },
      bankAccount: {
        bankAccountId: 'ba2',
        label: 'Euro account',
        currency: 'EUR',
        source: 'REQUEST',
      },
      currency: 'EUR',
      issueDate: { value: '2026-10-01', source: 'REQUEST' },
      dueDate: { value: '2026-10-31', source: 'REQUEST' },
      defaultsUsed: [],
    });
    const { container } = render(<DraftCard card={card({ proposal: p })} />);
    const t = text(container);
    expect(t).toContain('Side profile (you named it)');
    expect(t).toContain(
      'Euro account · EUR (matches the currency you asked for)'
    );
    expect(t).not.toContain('(today, default)');
    expect(t).not.toContain('(in 30 days, default)');
    expect(t).not.toContain('Defaults used');
  });

  it('AC-16: a custom price names the Customer it was agreed with', () => {
    const p = proposal({
      lines: [
        line({ rate: '45.00', amount: '900.00', rateSource: 'CUSTOM_PRICE' }),
      ],
      total: '900.00',
      subtotal: '900.00',
    });
    const { container } = render(<DraftCard card={card({ proposal: p })} />);
    const t = text(container);
    expect(t).toContain('Consulting 20 hours × 45.00 = 900.00 USD');
    expect(t).toContain('Custom price agreed with Acme Corp');
    expect(t).toContain('Total 900.00 USD');
  });

  it('a catalogue price names the product', () => {
    const p = proposal({ lines: [line({ rateSource: 'CATALOGUE' })] });
    const { container } = render(<DraftCard card={card({ proposal: p })} />);
    expect(text(container)).toContain('Price from your product Consulting');
  });

  it('AC-16b: a named price keeps the product link and shows the agreed custom price beside it', () => {
    const p = proposal({
      lines: [
        line({
          rate: '60.00',
          amount: '1200.00',
          rateSource: 'REQUEST',
          agreedCustomPrice: '45.00',
        }),
      ],
      total: '1200.00',
      subtotal: '1200.00',
    });
    const { container } = render(<DraftCard card={card({ proposal: p })} />);
    const t = text(container);
    expect(t).toContain('Consulting 20 hours × 60.00 = 1,200.00 USD');
    expect(t).toContain('Price you named');
    expect(t).toContain('Agreed custom price: 45.00 USD');
    expect(t).not.toContain('Not linked to a product');
  });

  it('AC-19: a free-text EUR line shows quantity and unit as defaults, the named price and no product link', () => {
    const p = proposal({
      bankAccount: {
        bankAccountId: 'ba2',
        label: 'Euro account',
        currency: 'EUR',
        source: 'REQUEST',
      },
      currency: 'EUR',
      lines: [
        line({
          name: 'Logo design',
          productId: null,
          quantity: '1.00',
          unit: 'item',
          rate: '600.00',
          amount: '600.00',
          quantitySource: 'DEFAULT',
          unitSource: 'DEFAULT',
        }),
      ],
      total: '600.00',
      subtotal: '600.00',
      defaultsUsed: [
        'senderProfile',
        'issueDate',
        'dueDate',
        'lines[0].quantity',
        'lines[0].unit',
      ],
    });
    const { container } = render(<DraftCard card={card({ proposal: p })} />);
    const t = text(container);
    expect(t).toContain(
      'Euro account · EUR (matches the currency you asked for)'
    );
    expect(t).toContain('Logo design 1 item (default) × 600.00 = 600.00 EUR');
    expect(t).toContain('Price you named');
    expect(t).toContain('Not linked to a product');
    expect(t).toContain('Total 600.00 EUR');
    expect(t).toContain(
      'Defaults used: sender profile, issue date, due date, quantity, unit.'
    );
  });

  it('a defaulted unit alone is marked "(default)" after the unit', () => {
    const p = proposal({
      lines: [line({ unit: 'item', unitSource: 'DEFAULT' })],
    });
    const { container } = render(<DraftCard card={card({ proposal: p })} />);
    expect(text(container)).toContain(
      'Consulting 20 item (default) × 50.00 = 1,000.00 USD'
    );
  });
});

describe('DraftCard - Create (AC-13, AC-14, AC-11c)', () => {
  it('creating: pressing Create calls createDraftFromCard(cardId) once, shows a Spinner and disables the button; a second press cannot fire', async () => {
    let resolve: (v: unknown) => void = () => {};
    createDraftFromCard.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<DraftCard card={card()} />);
    const btn = screen.getByRole('button', { name: 'Create draft' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await userEvent.click(btn);
    expect(createDraftFromCard).toHaveBeenCalledTimes(1);
    expect(createDraftFromCard).toHaveBeenCalledWith('card1');
    const pending = screen.getByRole('button', {
      name: /Create draft|Loading/,
    });
    expect(pending).toBeDisabled();
    expect(within(pending).getByRole('status')).toBeInTheDocument();
    resolve(
      ok({ kind: 'CREATED', invoiceId: 'inv43', invoiceNumber: 'INV-0043' })
    );
    await screen.findByText('Draft INV-0043 created.');
  });

  it('CREATED: Created badge, "Draft INV-0043 created.", a link that opens the editor, no Create button', async () => {
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'CREATED', invoiceId: 'inv43', invoiceNumber: 'INV-0043' })
    );
    const { container } = render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(
      await screen.findByText('Draft INV-0043 created.')
    ).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open in editor →/ })
    ).toHaveAttribute('href', '/invoices/inv43/edit');
    expect(createBtn()).not.toBeInTheDocument();
    expect(text(container)).toContain('Acme Corp');
  });

  it('ALREADY_CREATED with a DRAFT invoice shows the same link and creates nothing (AC-14)', async () => {
    createDraftFromCard.mockResolvedValue(
      ok({
        kind: 'ALREADY_CREATED',
        invoice: {
          state: 'DRAFT',
          invoiceId: 'inv43',
          invoiceNumber: 'INV-0043',
        },
      })
    );
    render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(
      await screen.findByText('Draft INV-0043 created.')
    ).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open in editor →/ })
    ).toHaveAttribute('href', '/invoices/inv43/edit');
    expect(createDraftFromCard).toHaveBeenCalledTimes(1);
  });

  it('ALREADY_CREATED with an invoice issued since shows "Invoice {number}" with its status and opens the editor (AC-36)', async () => {
    createDraftFromCard.mockResolvedValue(
      ok({
        kind: 'ALREADY_CREATED',
        invoice: {
          state: 'ISSUED',
          invoiceId: 'inv43',
          invoiceNumber: 'INV-0043',
          status: 'paid',
        },
      })
    );
    const { container } = render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText(/Invoice INV-0043/)).toBeInTheDocument();
    expect(text(container)).toContain('Paid');
    expect(screen.getByRole('link', { name: /INV-0043|Open/ })).toHaveAttribute(
      'href',
      '/invoices/inv43/edit'
    );
    expect(text(container)).not.toContain('Draft INV-0043 created.');
    expect(createBtn()).not.toBeInTheDocument();
  });

  it('ALREADY_CREATED with a deleted invoice shows "This draft is no longer available." and no link', async () => {
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'ALREADY_CREATED', invoice: { state: 'UNAVAILABLE' } })
    );
    render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(
      await screen.findByText('This draft is no longer available.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(createBtn()).not.toBeInTheDocument();
  });

  it('on load, state CREATED shows the Created badge and the link without any action call', () => {
    render(
      <DraftCard
        card={card({
          state: 'CREATED',
          invoice: {
            state: 'DRAFT',
            invoiceId: 'inv43',
            invoiceNumber: 'INV-0043',
          },
        })}
      />
    );
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Draft INV-0043 created.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open in editor →/ })
    ).toHaveAttribute('href', '/invoices/inv43/edit');
    expect(createBtn()).not.toBeInTheDocument();
    expect(createDraftFromCard).not.toHaveBeenCalled();
  });

  it('on load, a CREATED card whose invoice was issued or deleted since renders those states', () => {
    const { unmount } = render(
      <DraftCard
        card={card({
          state: 'CREATED',
          invoice: {
            state: 'ISSUED',
            invoiceId: 'inv43',
            invoiceNumber: 'INV-0043',
            status: 'overdue',
          },
        })}
      />
    );
    expect(screen.getByText(/Invoice INV-0043/)).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    unmount();
    render(
      <DraftCard
        card={card({ state: 'CREATED', invoice: { state: 'UNAVAILABLE' } })}
      />
    );
    expect(
      screen.getByText('This draft is no longer available.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('DraftCard - replaced, outdated, needs answers (AC-14b, AC-18)', () => {
  it('REPLACED result: collapses to Customer and total with "Replaced", points to the newer card, no Create', async () => {
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'REPLACED', newerCardId: 'card2' })
    );
    const newer = card({ id: 'card2' });
    const { container } = render(
      <>
        <DraftCard card={card()} />
        <DraftCard card={newer} />
      </>
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Create draft' })[0]
    );
    const old = container.querySelector('#draft-card-card1') as HTMLElement;
    await within(old).findByText('Replaced');
    const t = text(old);
    expect(t).toContain('Draft invoice · Acme Corp · 1,000.00 USD');
    expect(t).toContain('A newer card replaced this one.');
    expect(within(old).queryByText(/Consulting/)).not.toBeInTheDocument();
    expect(
      within(old).queryByRole('button', { name: 'Create draft' })
    ).not.toBeInTheDocument();
    await userEvent.click(within(old).getByText('Go to the newer card ↓'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(
      container.querySelector('#draft-card-card2')
    );
  });

  it('on load, state REPLACED renders the same collapsed card without Create', () => {
    render(
      <DraftCard card={card({ state: 'REPLACED', replacedById: 'card2' })} />
    );
    expect(screen.getByText('Replaced')).toBeInTheDocument();
    expect(
      screen.getByText('A newer card replaced this one.')
    ).toBeInTheDocument();
    expect(screen.getByText('Go to the newer card ↓')).toBeInTheDocument();
    expect(createBtn()).not.toBeInTheDocument();
  });

  it('OUTDATED result: the old card collapses and the returned card renders directly under it as the only Create', async () => {
    const successor = card({
      id: 'card2',
      proposal: proposal({
        lines: [
          line({ rate: '40.00', amount: '800.00', rateSource: 'CUSTOM_PRICE' }),
        ],
        total: '800.00',
        subtotal: '800.00',
      }),
    });
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'OUTDATED', card: successor })
    );
    const { container } = render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    const old = (await waitFor(() => {
      const el = container.querySelector('#draft-card-card1') as HTMLElement;
      expect(within(el).getByText('Outdated')).toBeInTheDocument();
      return el;
    })) as HTMLElement;
    expect(text(old)).toContain('Draft invoice · Acme Corp · 1,000.00 USD');
    expect(text(old)).toContain(
      'Something changed since this card was made: a price, the Customer, the sender profile, the bank account or the date. Check the updated card below.'
    );
    expect(
      within(old).queryByRole('button', { name: 'Create draft' })
    ).not.toBeInTheDocument();
    const fresh = container.querySelector('#draft-card-card2') as HTMLElement;
    expect(fresh).not.toBeNull();
    expect(
      old.compareDocumentPosition(fresh) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(text(fresh)).toContain('Consulting 20 hours × 40.00 = 800.00 USD');
    expect(text(fresh)).toContain('Total 800.00 USD');
    expect(
      screen.getAllByRole('button', { name: 'Create draft' })
    ).toHaveLength(1);
    // the successor can be created: Create fires for its own id
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'CREATED', invoiceId: 'inv50', invoiceNumber: 'INV-0050' })
    );
    await userEvent.click(
      within(fresh).getByRole('button', { name: 'Create draft' })
    );
    expect(createDraftFromCard).toHaveBeenLastCalledWith('card2');
    expect(
      await screen.findByText('Draft INV-0050 created.')
    ).toBeInTheDocument();
  });

  it('on load, OUTDATED with a replacedById collapses like Replaced with the outdated copy and no Create', () => {
    render(
      <DraftCard card={card({ state: 'OUTDATED', replacedById: 'card2' })} />
    );
    expect(screen.getByText('Outdated')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Something changed since this card was made: a price, the Customer, the sender profile, the bank account or the date\. Check the updated card below\./
      )
    ).toBeInTheDocument();
    expect(createBtn()).not.toBeInTheDocument();
  });

  it('NEEDS_ANSWERS: Outdated, one line per issue, then "Nothing was created. Ask again in the chat."', async () => {
    createDraftFromCard.mockResolvedValue(
      ok({
        kind: 'NEEDS_ANSWERS',
        issues: [
          { kind: 'CUSTOMER_NOT_FOUND', written: 'Acme Corp' },
          { kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' },
        ],
      })
    );
    const { container } = render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(
      await screen.findByText('Acme Corp is no longer among your Customers.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('You need a sender profile with a bank account.')
    ).toBeInTheDocument();
    expect(screen.getByText('Outdated')).toBeInTheDocument();
    expect(text(container)).toContain(
      'Nothing was created. Ask again in the chat.'
    );
    expect(text(container)).toContain(
      'Draft invoice · Acme Corp · 1,000.00 USD'
    );
    expect(createBtn()).not.toBeInTheDocument();
  });

  it('on load, OUTDATED without a replacedById shows only "This card is out of date and can\'t be created. Ask again in the chat."', () => {
    const { container } = render(
      <DraftCard card={card({ state: 'OUTDATED', replacedById: null })} />
    );
    expect(screen.getByText('Outdated')).toBeInTheDocument();
    expect(text(container)).toContain(
      "This card is out of date and can't be created. Ask again in the chat."
    );
    expect(text(container)).not.toContain('Nothing was created.');
    expect(createBtn()).not.toBeInTheDocument();
  });
});

describe('DraftCard - failures', () => {
  it('NOT_FOUND: toast "This draft card is no longer available." and the card dims without Create or a link', async () => {
    createDraftFromCard.mockResolvedValue(
      fail('NOT_FOUND', 'This draft card is no longer available.')
    );
    render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'This draft card is no longer available.'
      )
    );
    await waitFor(() => expect(createBtn()).not.toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Go to the newer card ↓')
    ).not.toBeInTheDocument();
  });

  it('FAILED: toast "The draft couldn\'t be created. Try again." and the card stays live and usable', async () => {
    createDraftFromCard.mockResolvedValue(
      fail('FAILED', "The draft couldn't be created. Try again.")
    );
    render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "The draft couldn't be created. Try again."
      )
    );
    await waitFor(() => expect(createBtn()).toBeEnabled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'CREATED', invoiceId: 'inv43', invoiceNumber: 'INV-0043' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(
      await screen.findByText('Draft INV-0043 created.')
    ).toBeInTheDocument();
    expect(createDraftFromCard).toHaveBeenCalledTimes(2);
  });

  it('UNAUTHORIZED goes to sign-in', async () => {
    createDraftFromCard.mockResolvedValue(
      fail('UNAUTHORIZED', 'Not signed in.')
    );
    render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });

  it('a rejected call goes to sign-in and clears the pending state', async () => {
    createDraftFromCard.mockRejectedValue(new Error('network'));
    render(<DraftCard card={card()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(SIGN_IN));
  });
});

describe('Conversation page - card slot (SCR-02, SCR-03 loading, AC-11c)', () => {
  const messages = [
    {
      id: 'm1',
      role: 'assistant' as const,
      parts: [
        { type: 'text' as const, text: 'Here is the draft for Acme Corp.' },
        {
          type: 'data-draft-card' as const,
          id: 'p1',
          data: { cardId: 'card1' },
        },
      ],
      createdAt: '2026-10-10T09:01:05.000Z',
    },
  ];
  const conversation = {
    id: 'c1',
    title: 'Draft for Acme',
    lastMessageAt: '2026-10-10T09:01:05.000Z',
  };

  it('renders the stored card in the slot and Create works with the allowance used up (AC-11c)', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation,
        messages,
        cards: { card1: card() },
        invoiceLinks: {},
      },
    });
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'CREATED', invoiceId: 'inv43', invoiceNumber: 'INV-0043' })
    );
    const { container } = render(
      await ConversationPage({
        params: Promise.resolve({ conversationId: 'c1' }),
      })
    );
    expect(text(container)).toContain(
      'Consulting 20 hours × 50.00 = 1,000.00 USD'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(createDraftFromCard).toHaveBeenCalledWith('card1');
    expect(
      await screen.findByText('Draft INV-0043 created.')
    ).toBeInTheDocument();
  });

  it('after reload, an OUTDATED card in the slot renders its stored successor under it: the scroll target exists and Create works (AC-18, AC-35, R-03)', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation,
        messages,
        cards: {
          card1: card({ state: 'OUTDATED', replacedById: 'card2' }),
          card2: card({ id: 'card2' }),
        },
        invoiceLinks: {},
      },
    });
    createDraftFromCard.mockResolvedValue(
      ok({ kind: 'CREATED', invoiceId: 'inv51', invoiceNumber: 'INV-0051' })
    );
    const { container } = render(
      await ConversationPage({
        params: Promise.resolve({ conversationId: 'c1' }),
      })
    );
    const old = container.querySelector('#draft-card-card1') as HTMLElement;
    const fresh = container.querySelector('#draft-card-card2') as HTMLElement;
    expect(within(old).getByText('Outdated')).toBeInTheDocument();
    expect(fresh).not.toBeNull();
    expect(
      old.compareDocumentPosition(fresh) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: 'Create draft' })
    ).toHaveLength(1);
    await userEvent.click(within(old).getByText('Go to the newer card ↓'));
    expect(scrollIntoView).toHaveBeenCalled();
    await userEvent.click(
      within(fresh).getByRole('button', { name: 'Create draft' })
    );
    expect(createDraftFromCard).toHaveBeenCalledWith('card2');
    expect(
      await screen.findByText('Draft INV-0051 created.')
    ).toBeInTheDocument();
  });

  it('after reload, a successor created since shows its invoice state under the outdated card (AC-36, R-03)', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: {
        conversation,
        messages,
        cards: {
          card1: card({ state: 'OUTDATED', replacedById: 'card2' }),
          card2: card({
            id: 'card2',
            state: 'CREATED',
            invoice: {
              state: 'ISSUED',
              invoiceId: 'inv50',
              invoiceNumber: 'INV-0050',
              status: 'paid',
            },
          }),
        },
        invoiceLinks: {},
      },
    });
    const { container } = render(
      await ConversationPage({
        params: Promise.resolve({ conversationId: 'c1' }),
      })
    );
    const fresh = container.querySelector('#draft-card-card2') as HTMLElement;
    expect(fresh).not.toBeNull();
    expect(within(fresh).getByText('Created')).toBeInTheDocument();
    expect(text(fresh)).toContain('Invoice INV-0050');
    expect(createBtn()).not.toBeInTheDocument();
  });

  it('shows a card-sized skeleton, not a Create button, while the card has not arrived (loading)', async () => {
    getConversation.mockResolvedValue({
      success: true,
      data: { conversation, messages, cards: {}, invoiceLinks: {} },
    });
    const { container } = render(
      await ConversationPage({
        params: Promise.resolve({ conversationId: 'c1' }),
      })
    );
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(createBtn()).not.toBeInTheDocument();
  });
});
