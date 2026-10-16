// @vitest-environment jsdom
// T23 (ai-assistant; AC-36, AC-07) - ChatLink: invoice states (draft / issued / unavailable) and page links.
// See docs/features/ai-assistant/tasks/t23-conversation-page-and-chat-links.md and screens.md §SCR-02 "links".
//
// Seam the implementer must provide:
//   components/ai/chat-link.tsx -> export function ChatLink(props: { link: AppLink; state?: LinkedInvoiceState })
//     invoice + DRAFT       -> anchor to protectedRoutes.invoiceEdit(invoiceId), text "{invoiceNumber} · Draft"
//     invoice + ISSUED      -> anchor to the editor, text invoiceNumber + an InvoiceStatusBadge (label from `status`)
//     invoice + UNAVAILABLE -> NOT an anchor; plain text "{link.label} · No longer available"
//     invoice + no state    -> not an anchor (never presented as a draft); shows link.label
//     page                  -> anchor to appPageRoute(page, senderProfileId), text "{APP_MAP title} →"
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ChatLink } from '@/components/ai/chat-link';
import { appPageRoute } from '@/lib/ai/app-map';
import type { AppLink } from '@/lib/validations/assistant-chat';
import type { LinkedInvoiceState } from '@/types/assistant/types';

afterEach(cleanup);

const invoiceLink: AppLink = { kind: 'invoice', invoiceId: 'inv43', label: 'INV-0043' };

describe('ChatLink - invoice states (AC-36)', () => {
  it('a draft shows "INV-0043 · Draft" and opens the editor', () => {
    const state: LinkedInvoiceState = { state: 'DRAFT', invoiceId: 'inv43', invoiceNumber: 'INV-0043' };
    render(<ChatLink link={invoiceLink} state={state} />);
    const a = screen.getByRole('link', { name: /INV-0043 · Draft/ });
    expect(a).toHaveAttribute('href', '/invoices/inv43/edit');
  });

  it('an invoice issued since shows its number and the status badge, and opens the editor', () => {
    const state: LinkedInvoiceState = {
      state: 'ISSUED',
      invoiceId: 'inv42',
      invoiceNumber: 'INV-0042',
      status: 'overdue',
    };
    render(<ChatLink link={{ kind: 'invoice', invoiceId: 'inv42', label: 'INV-0042' }} state={state} />);
    const a = screen.getByRole('link', { name: /INV-0042/ });
    expect(a).toHaveAttribute('href', '/invoices/inv42/edit');
    expect(a).toHaveTextContent('Overdue');
    expect(a).not.toHaveTextContent('Draft');
  });

  it('a deleted invoice shows "INV-0043 · No longer available" as plain text, never an anchor', () => {
    render(<ChatLink link={invoiceLink} state={{ state: 'UNAVAILABLE' }} />);
    expect(screen.getByText('INV-0043 · No longer available')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('without a known state it is not presented as a draft link', () => {
    render(<ChatLink link={invoiceLink} />);
    expect(screen.queryByText(/Draft/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('ChatLink - page links from the app map (AC-07)', () => {
  it('shows "{page title} →" linking to the route from the fixed map', () => {
    render(<ChatLink link={{ kind: 'page', page: 'sender-profiles' }} />);
    const a = screen.getByRole('link', { name: 'Sender profiles →' });
    expect(a).toHaveAttribute('href', appPageRoute('sender-profiles'));
  });

  it('resolves the bank-accounts page with the sender profile id', () => {
    render(<ChatLink link={{ kind: 'page', page: 'sender-profile-bank-accounts', senderProfileId: 'sp1' }} />);
    expect(screen.getByRole('link', { name: 'Sender profile bank accounts →' })).toHaveAttribute(
      'href',
      appPageRoute('sender-profile-bank-accounts', 'sp1')
    );
  });

  it('links to settings-assistants and new-invoice (SCR-09, SCR-10 targets)', () => {
    render(
      <>
        <ChatLink link={{ kind: 'page', page: 'settings-assistants' }} />
        <ChatLink link={{ kind: 'page', page: 'new-invoice' }} />
      </>
    );
    expect(screen.getByRole('link', { name: 'Assistants settings →' })).toHaveAttribute('href', '/settings/assistants');
    expect(screen.getByRole('link', { name: 'New invoice →' })).toHaveAttribute('href', '/invoices/new');
  });
});

// fix 2026-10-12 (AC-07, AC-35): a link stored without the profile id, as find_in_app once produced, must
// still render when the Conversation is reopened; it opens the sender profiles list instead of crashing.
describe('ChatLink - a stored bank-accounts link without a sender profile id', () => {
  it('links to the sender profiles page instead of throwing', () => {
    render(<ChatLink link={{ kind: 'page', page: 'sender-profile-bank-accounts' }} />);
    expect(screen.getByRole('link', { name: 'Sender profiles →' })).toHaveAttribute('href', appPageRoute('sender-profiles'));
  });
});
