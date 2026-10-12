// @vitest-environment jsdom
// T22 (ai-assistant; AC-01, AC-10, AC-33, AC-34) - SCR-01 start panel: default, example picked,
// start=draft, used-up, used-up from Create with AI; and the /ai page wiring.
// See docs/features/ai-assistant/tasks/t22-ai-start-panel-and-allowance-notice.md and screens.md §SCR-01.
//
// Seams the implementer must provide:
//   components/ai/start-panel.tsx -> export function StartPanel(props: {
//     state: AllowanceState; start?: 'draft'; onSend: (text: string) => void })   ('use client')
//     default: heading "Ask about your invoices", four example Buttons, a textbox (placeholder
//       "Ask a question or describe an invoice"), a "Send" button, the counter, link
//       "Connect your own AI client →" -> /settings/assistants.
//     start=draft: heading "Draft an invoice", placeholder `e.g. "Invoice Acme for 20 hours of consulting at $50"`,
//       ONE example button "Invoice Acme for 20 hours of consulting at $50", composer focused on arrival.
//     left = 0: textbox, Send and examples are gone; AllowanceNotice used-up mode; start=draft adds
//       "Create it by hand →" -> /invoices/new.
//     clicking an example fills the textbox, focuses it, and never calls onSend.
//   app/(protected)/ai/page.tsx -> also reads getAllowanceState(actor) (unwraps failures, throws) and
//     `start` from searchParams ('draft' only; any other value = navigation); renders the panel beside the list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai',
  useSearchParams: () => new URLSearchParams(),
}));

const listConversations = vi.fn();
const getAllowanceState = vi.fn();
vi.mock('@/lib/services/conversations', () => ({
  listConversations: (...a: unknown[]) => listConversations(...a),
}));
vi.mock('@/lib/services/assistant-usage', () => ({
  getAllowanceState: (...a: unknown[]) => getAllowanceState(...a),
}));
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({
    success: true,
    data: { userId: 'u1', timeZone: 'Europe/Kyiv' },
  }),
}));

import { StartPanel } from '@/components/ai/start-panel';
import AiPage from '@/app/(protected)/ai/page';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

const EXAMPLES = [
  'Who owes me money right now?',
  "What's overdue today?",
  'How much did I invoice this month?',
  'Where do I change the logo on my invoices?',
];
const DRAFT_EXAMPLE = 'Invoice Acme for 20 hours of consulting at $50';
const DRAFT_PLACEHOLDER = `e.g. "${DRAFT_EXAMPLE}"`;

function state(over: Partial<AllowanceState> = {}): AllowanceState {
  return {
    limit: 30,
    used: 1,
    left: 29,
    renewsAt: '2026-10-12T21:00:00.000Z',
    timeZone: 'Europe/Kyiv',
    ...over,
  } as AllowanceState;
}
const usedUp = () => state({ used: 30, left: 0 });

beforeEach(() => {
  listConversations.mockReset();
  getAllowanceState.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StartPanel - default (AC-01)', () => {
  it('shows the heading, four examples, composer, Send, counter and the connect link', () => {
    render(<StartPanel state={state()} onSend={() => {}} />);
    expect(screen.getByText('Ask about your invoices')).toBeInTheDocument();
    for (const ex of EXAMPLES) expect(screen.getByRole('button', { name: ex })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask a question or describe an invoice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByText('29 of 30 messages left today')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect your own AI client →' })).toHaveAttribute(
      'href',
      '/settings/assistants'
    );
    expect(screen.queryByText("You've used today's 30 messages")).not.toBeInTheDocument();
  });

  it('passes the typed text to onSend when Send is pressed', async () => {
    const onSend = vi.fn();
    render(<StartPanel state={state()} onSend={onSend} />);
    await userEvent.type(screen.getByPlaceholderText('Ask a question or describe an invoice'), 'Hello there');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Hello there');
  });
});

describe('StartPanel - example picked', () => {
  it('fills the composer, focuses it and sends nothing', async () => {
    const onSend = vi.fn();
    render(<StartPanel state={state()} onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: "What's overdue today?" }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe("What's overdue today?");
    expect(box).toHaveFocus();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('StartPanel - start=draft (AC-33)', () => {
  it('shows the draft heading, the example placeholder and one example chip instead of the four questions', () => {
    render(<StartPanel state={state()} start="draft" onSend={() => {}} />);
    expect(screen.getByText('Draft an invoice')).toBeInTheDocument();
    expect(screen.queryByText('Ask about your invoices')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(DRAFT_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DRAFT_EXAMPLE })).toBeInTheDocument();
    for (const ex of EXAMPLES) expect(screen.queryByRole('button', { name: ex })).not.toBeInTheDocument();
    expect(screen.getByText('29 of 30 messages left today')).toBeInTheDocument();
  });

  it('fills the composer from the chip without sending', async () => {
    const onSend = vi.fn();
    render(<StartPanel state={state()} start="draft" onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: DRAFT_EXAMPLE }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(DRAFT_EXAMPLE);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('StartPanel - used-up (AC-10)', () => {
  it('replaces the composer and the examples with the used-up notice, no hand-made link', () => {
    render(<StartPanel state={usedUp()} onSend={() => {}} />);
    expect(screen.getByText("You've used today's 30 messages")).toBeInTheDocument();
    expect(screen.getByText(/They renew at 00:00 your time\./)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    for (const ex of EXAMPLES) expect(screen.queryByRole('button', { name: ex })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect your own AI client →' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create it by hand →' })).not.toBeInTheDocument();
  });
});

describe('StartPanel - used-up from Create with AI (AC-34)', () => {
  it('shows the notice and "Create it by hand →" to /invoices/new before anything is typed', () => {
    render(<StartPanel state={usedUp()} start="draft" onSend={() => {}} />);
    expect(screen.getByText("You've used today's 30 messages")).toBeInTheDocument();
    expect(screen.getByText(/They renew at 00:00 your time\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create it by hand →' })).toHaveAttribute('href', '/invoices/new');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DRAFT_EXAMPLE })).not.toBeInTheDocument();
  });
});

describe('AI page wiring', () => {
  const emptyPage = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0, hasMore: false };

  beforeEach(() => {
    listConversations.mockResolvedValue({ success: true, data: emptyPage });
  });

  it('reads the allowance of the signed-in freelancer and renders the default panel', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: state() });
    const ui = await AiPage({ searchParams: Promise.resolve({}) });
    expect(getAllowanceState).toHaveBeenCalledWith({ userId: 'u1', timeZone: 'Europe/Kyiv' });
    render(ui);
    expect(screen.getByText('Ask about your invoices')).toBeInTheDocument();
    expect(screen.getByText('29 of 30 messages left today')).toBeInTheDocument();
  });

  it('renders the draft variant for ?start=draft', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: state() });
    render(await AiPage({ searchParams: Promise.resolve({ start: 'draft' }) }));
    expect(screen.getByText('Draft an invoice')).toBeInTheDocument();
  });

  it('treats an unknown start value as navigation', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: state() });
    render(await AiPage({ searchParams: Promise.resolve({ start: 'bogus' }) }));
    expect(screen.getByText('Ask about your invoices')).toBeInTheDocument();
    expect(screen.queryByText('Draft an invoice')).not.toBeInTheDocument();
  });

  it('keeps the list readable and shows the used-up notice when nothing is left', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: usedUp() });
    listConversations.mockResolvedValue({
      success: true,
      data: {
        ...emptyPage,
        items: [{ id: 'c1', title: 'Who owes me money?', lastMessageAt: '2026-10-10T09:00:00.000Z' }],
        total: 1,
        totalPages: 1,
      },
    });
    render(await AiPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("You've used today's 30 messages")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Who owes me money\?/ })).toHaveAttribute('href', '/ai/c1');
    expect(screen.queryByRole('link', { name: 'Create it by hand →' })).not.toBeInTheDocument();
  });

  it('adds the hand-made link when used up via ?start=draft', async () => {
    getAllowanceState.mockResolvedValue({ success: true, data: usedUp() });
    render(await AiPage({ searchParams: Promise.resolve({ start: 'draft' }) }));
    expect(screen.getByRole('link', { name: 'Create it by hand →' })).toHaveAttribute('href', '/invoices/new');
  });

  it('routes a failed allowance read to the error boundary by throwing', async () => {
    getAllowanceState.mockResolvedValue({ success: false, code: 'FAILED', error: 'boom' });
    await expect(AiPage({ searchParams: Promise.resolve({}) })).rejects.toBeDefined();
  });
});
