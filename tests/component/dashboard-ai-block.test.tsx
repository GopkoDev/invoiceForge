// @vitest-environment jsdom
// T26 (ai-chat-v2; AC-29, AC-30, AC-31, AC-32; screens.md §SCR-09; ADR-0009): the dashboard AI block - the prompt
// box hand-off, the latest three Conversations, "All conversations →", the used-up state - and the header's
// "Create invoice with AI" link before "Create Invoice".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

import { DashboardAiBlock } from '@/components/dashboard/ai-block';
import { DashboardHeader } from '@/components/dashboard/header/dashboard-header';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { ConversationSummary } from '@/types/assistant/types';

const EMPTY = 'Type a message first.';
const TOO_LONG = 'Messages can be at most 2,000 characters. Shorten it and send again.';
const NONE_YET = 'No conversations yet. Your chats with AI will show here.';

const allowance = (left: number): AllowanceState => ({
  limit: 30,
  used: 30 - left,
  left,
  renewsAt: '2026-10-14T00:00:00.000Z',
  timeZone: 'UTC',
});
const latest: ConversationSummary[] = [
  { id: 'c5', title: 'Invoice Acme for 20 h', lastMessageAt: '2026-10-12T10:00:00.000Z' },
  { id: 'c4', title: 'Who owes me money?', lastMessageAt: '2026-10-12T09:00:00.000Z' },
  { id: 'c3', title: 'Bank accounts in EUR', lastMessageAt: '2026-10-11T09:00:00.000Z' },
];

function block(left = 29, items = latest) {
  return render(<DashboardAiBlock allowance={allowance(left)} latest={items} timeZone="UTC" />);
}
const box = () => screen.getByRole('textbox', { name: 'Message to AI' });
const sendButton = () => screen.getByRole('button', { name: 'Send to AI' });

beforeEach(() => {
  push.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('DashboardAiBlock - default (AC-30)', () => {
  it('"Ask AI" with the prompt box, the counter, the latest three as links and "All conversations →"', () => {
    block();
    expect(screen.getByText('Ask AI')).toBeTruthy();
    expect(box().getAttribute('placeholder')).toBe('Ask about your invoices or describe one to draft');
    expect(screen.getByText('29 of 30 messages left today')).toBeTruthy();
    const recent = screen.getByRole('list', { name: 'Recent conversations' });
    const links = within(recent).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/ai/c5', '/ai/c4', '/ai/c3']);
    expect(links[0].textContent).toContain('Invoice Acme for 20 h');
    expect(links[0].textContent).toContain('12 Oct 2026');
    expect(screen.getByRole('link', { name: 'All conversations →' }).getAttribute('href')).toBe('/ai');
  });

  it('none yet: says so instead of the list and keeps "All conversations →"', () => {
    block(29, []);
    expect(screen.getByText(NONE_YET)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Recent conversations' })).toBeNull();
    expect(screen.getByRole('link', { name: 'All conversations →' })).toBeTruthy();
  });
});

describe('DashboardAiBlock - prompt box (AC-29, AC-31)', () => {
  it('AC-29: a valid prompt is stored under a one-time id and opens /ai?handoff={id}; the text is never in the URL', async () => {
    block();
    const user = userEvent.setup();
    await user.type(box(), '  who owes me money?  ');
    await user.click(sendButton());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const url = String(push.mock.calls[0][0]);
    const match = url.match(/^\/ai\?handoff=([A-Za-z0-9_-]+)$/);
    expect(match).not.toBeNull();
    expect(url).not.toMatch(/owes/);
    const stored = Object.keys(window.sessionStorage).map((k) => window.sessionStorage.getItem(k));
    expect(stored).toEqual(['who owes me money?']);
    // sending: the box is read-only and the button busy
    expect(box()).toHaveProperty('readOnly', true);
    expect(sendButton()).toBeDisabled();
  });

  it('Enter sends and Shift+Enter is a newline', async () => {
    block();
    const user = userEvent.setup();
    await user.type(box(), 'line one{Shift>}{Enter}{/Shift}line two');
    expect(push).not.toHaveBeenCalled();
    expect((box() as HTMLTextAreaElement).value).toBe('line one\nline two');
    await user.type(box(), '{Enter}');
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it('AC-31: an empty or whitespace prompt says "Type a message first." and stores and opens nothing', async () => {
    block();
    const user = userEvent.setup();
    await user.click(sendButton());
    expect(await screen.findByText(EMPTY)).toBeTruthy();
    await user.type(box(), '   ');
    await user.click(sendButton());
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('AC-31: over 2,000 characters after trimming shows the limit and the count, and sends nothing', async () => {
    block();
    const user = userEvent.setup();
    const long = 'a'.repeat(2140);
    await user.click(box());
    await user.paste(long);
    expect(await screen.findByText(TOO_LONG)).toBeTruthy();
    expect(screen.getByText('2,140 / 2,000')).toBeTruthy();
    await user.click(sendButton());
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('exactly 2,000 characters is accepted', async () => {
    block();
    const user = userEvent.setup();
    await user.click(box());
    await user.paste('b'.repeat(2000));
    await user.click(sendButton());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });
});

describe('DashboardAiBlock - used-up (AC-32)', () => {
  it('replaces the prompt box with the used-up notice and "Create it by hand →"; the links stay', () => {
    block(0);
    expect(screen.queryByRole('textbox', { name: 'Message to AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send to AI' })).toBeNull();
    expect(screen.getByText("You've used today's 30 messages")).toBeTruthy();
    expect(screen.getByText(/They renew .* your time\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create it by hand →' }).getAttribute('href')).toBe('/invoices/new');
    expect(within(screen.getByRole('list', { name: 'Recent conversations' })).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'All conversations →' })).toBeTruthy();
  });
});

describe('DashboardHeader - Create invoice with AI (AC-30)', () => {
  it('sits just before "Create Invoice" and opens /ai?start=draft&from=dashboard', () => {
    render(<DashboardHeader currencyTabs={[]} selectedCurrency="USD" appliedPeriod={undefined} today="2026-10-13" />);
    const links = screen.getAllByRole('link');
    const ai = screen.getByRole('link', { name: 'Create invoice with AI' });
    const create = screen.getByRole('link', { name: 'Create new invoice' });
    expect(ai.getAttribute('href')).toBe('/ai?start=draft&from=dashboard');
    expect(links.indexOf(ai)).toBe(links.indexOf(create) - 1);
  });
});
