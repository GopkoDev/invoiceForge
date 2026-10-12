// @vitest-environment jsdom
// T19 (ai-assistant; AC-23) — AssistantMark: a small outline "AI" badge with a tooltip naming the
// Assistant (in-app chat, or the Personal key's name as it was at creation); nothing for null.
// Also the two places it appears: a draft row in InvoicesDataTable and the InvoiceEditorHeader.
// See docs/features/ai-assistant/tasks/t19-create-with-ai-entry-and-assistant-mark.md and screens.md §SCR-05, §SCR-06.
//
// Seams the implementer must provide:
//   components/ai/assistant-mark.tsx -> export function AssistantMark(props: { mark: AssistantMark })
//     (null -> renders nothing). Trigger shows the text "AI"; hovering it shows the tooltip text.
//   InvoicesDataTable renders <AssistantMark mark={row.assistantMark ?? null}/> next to the status badge.
//   InvoiceEditorHeader renders it beside the status Badge, reading `assistantMark` from the editor
//     data the store was built from (InvoiceEditorData.assistantMark): store field or equivalent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssistantMark as Mark, InvoiceEditorData, InvoiceListItem } from '@/types/invoice/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: vi.fn(),
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-2026-0043' }),
  getInvoiceEditorData: vi.fn(),
}));
vi.mock('@/lib/pdf/load-pdf-kit', () => ({ loadPdfKit: () => Promise.resolve({}) }));
vi.mock('@/components/invoices/invoice-row-actions', () => ({ InvoiceRowActions: () => null }));

import { AssistantMark } from '@/components/ai/assistant-mark';
import { InvoicesDataTable } from '@/components/invoices/invoices-data-table';
import { InvoiceEditorHeader } from '@/components/invoice-editor/invoice-editor-header';
import { emptyEditorData, renderWithEditorStore } from '../support/render-with-editor-store';

const CHAT: Mark = { origin: 'CHAT' };
const KEY: Mark = { origin: 'PERSONAL_KEY', keyName: 'Claude Desktop' };

async function hoverAi(user: ReturnType<typeof userEvent.setup>) {
  await user.hover(screen.getByText('AI'));
}

describe('AssistantMark (AC-23)', () => {
  it('shows "AI" with the tooltip "Created by the in-app chat" for a CHAT draft', async () => {
    const user = userEvent.setup();
    render(<AssistantMark mark={CHAT} />);
    await hoverAi(user);
    expect(await screen.findByText('Created by the in-app chat')).toBeTruthy();
  });

  it('shows "AI" with the tooltip "Created by {keyName}" for a Personal-key draft', async () => {
    const user = userEvent.setup();
    render(<AssistantMark mark={KEY} />);
    await hoverAi(user);
    expect(await screen.findByText('Created by Claude Desktop')).toBeTruthy();
  });

  it('renders nothing for null', () => {
    const { container } = render(<AssistantMark mark={null} />);
    expect(container.innerHTML).toBe('');
  });
});

function row(over: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 'i1',
    invoiceNumber: 'INV-1',
    status: 'DRAFT',
    storedStatus: 'DRAFT',
    issueDate: new Date('2026-10-01T00:00:00.000Z'),
    dueDate: new Date('2026-10-15T00:00:00.000Z'),
    total: 900,
    currency: 'USD',
    customerName: 'Acme Corp',
    senderName: 'Studio',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    paidAt: null,
    assistantMark: null,
    ...over,
  };
}

describe('invoice list rows (AC-23)', () => {
  it('marks Assistant drafts next to the status badge, not hand-made or issued rows', async () => {
    const user = userEvent.setup();
    render(
      <table>
        <InvoicesDataTable
          invoices={[
            row({ id: 'a', invoiceNumber: 'INV-A', customerName: 'Acme Corp', assistantMark: CHAT }),
            row({ id: 'b', invoiceNumber: 'INV-B', customerName: 'Globex Ltd', assistantMark: KEY }),
            row({ id: 'c', invoiceNumber: 'INV-C', customerName: 'Hand Made', assistantMark: null }),
            row({ id: 'd', invoiceNumber: 'INV-D', customerName: 'Issued Co', status: 'PENDING', storedStatus: 'PENDING', assistantMark: null }),
          ]}
          sortBy="issueDate"
          sortOrder="desc"
          onSort={() => {}}
        />
      </table>
    );
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

    expect(within(rowOf('Acme Corp')).getByText('AI')).toBeTruthy();
    expect(within(rowOf('Acme Corp')).getByText('Draft')).toBeTruthy();
    expect(within(rowOf('Globex Ltd')).getByText('AI')).toBeTruthy();
    expect(within(rowOf('Hand Made')).queryByText('AI')).toBeNull();
    expect(within(rowOf('Issued Co')).queryByText('AI')).toBeNull();
    expect(screen.getAllByText('AI')).toHaveLength(2);

    await user.hover(within(rowOf('Globex Ltd')).getByText('AI'));
    expect(await screen.findByText('Created by Claude Desktop')).toBeTruthy();
  });
});

function editorData(over: Partial<InvoiceEditorData>): InvoiceEditorData {
  const base = emptyEditorData();
  return { ...base, invoiceId: 'inv-1', version: 1, ...over } as InvoiceEditorData;
}

describe('editor header (AC-23)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the mark beside the Draft badge with the chat tooltip', async () => {
    const user = userEvent.setup();
    renderWithEditorStore(<InvoiceEditorHeader />, { initial: editorData({ assistantMark: CHAT }) });
    expect(screen.getByText('Draft')).toBeTruthy();
    await hoverAi(user);
    expect(await screen.findByText('Created by the in-app chat')).toBeTruthy();
  });

  it('names the Personal key in the tooltip', async () => {
    const user = userEvent.setup();
    renderWithEditorStore(<InvoiceEditorHeader />, { initial: editorData({ assistantMark: KEY }) });
    await hoverAi(user);
    expect(await screen.findByText('Created by Claude Desktop')).toBeTruthy();
  });

  it('shows no mark for a hand-made draft or an issued invoice', () => {
    const issued = editorData({ assistantMark: null });
    issued.initialData = { ...issued.initialData!, status: 'PENDING' };
    renderWithEditorStore(<InvoiceEditorHeader />, { initial: editorData({ assistantMark: null }) });
    expect(screen.queryByText('AI')).toBeNull();
    document.body.innerHTML = '';
    renderWithEditorStore(<InvoiceEditorHeader />, { initial: issued });
    expect(screen.queryByText('AI')).toBeNull();
  });
});
