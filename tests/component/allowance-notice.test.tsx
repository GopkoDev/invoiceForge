// @vitest-environment jsdom
// T22 (ai-assistant; AC-01, AC-10, AC-34) - AllowanceNotice: counter mode, used-up mode, the renewsAt rule.
// See docs/features/ai-assistant/tasks/t22-ai-start-panel-and-allowance-notice.md and screens.md §New components.
//
// Seam the implementer must provide:
//   components/ai/allowance-notice.tsx -> export function AllowanceNotice(props: {
//     state: AllowanceState; usedUpMessage?: string; handMadeLink?: boolean })
//   Mode is derived from state.left: > 0 = counter "{left} of 30 messages left today";
//   0 = used-up notice: "You've used today's 30 messages", "They renew {when} your time. An AI client
//   connected with a Personal key isn't affected, and your conversations stay readable.", link
//   "Connect your own AI client →" (/settings/assistants), and, only with handMadeLink,
//   "Create it by hand →" (/invoices/new). {when} is "at 00:00" at the next local midnight, else
//   "tomorrow at HH:mm" (a later calendar day than now in the zone) or "at HH:mm" (same day). The component
//   reads the current time with Date.now()/new Date() (the tests fake only Date).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AllowanceNotice } from '@/components/ai/allowance-notice';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

const KYIV = 'Europe/Kyiv'; // UTC+3 in October 2026 (DST ends 25 Oct)

function state(over: Partial<AllowanceState> = {}): AllowanceState {
  return {
    limit: 30,
    used: 1,
    left: 29,
    renewsAt: '2026-10-12T21:00:00.000Z', // Kyiv midnight 13 Oct
    timeZone: KYIV,
    ...over,
  } as AllowanceState;
}

const usedUp = (over: Partial<AllowanceState> = {}) => state({ used: 30, left: 0, ...over });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z')); // 13:00 in Kyiv
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AllowanceNotice - counter mode (AC-01)', () => {
  it('shows "{left} of 30 messages left today"', () => {
    render(<AllowanceNotice state={state()} />);
    expect(screen.getByText('29 of 30 messages left today')).toBeInTheDocument();
  });

  it('shows 1 of 30 without the used-up notice', () => {
    render(<AllowanceNotice state={state({ used: 29, left: 1 })} />);
    expect(screen.getByText('1 of 30 messages left today')).toBeInTheDocument();
    expect(screen.queryByText("You've used today's 30 messages")).not.toBeInTheDocument();
  });
});

describe('AllowanceNotice - used-up mode (AC-10)', () => {
  it('says the allowance is used up, the Personal-key note and the connect link', () => {
    render(<AllowanceNotice state={usedUp()} />);
    expect(screen.getByText("You've used today's 30 messages")).toBeInTheDocument();
    expect(screen.getByText(/An AI client connected with a Personal key isn't affected/)).toBeInTheDocument();
    expect(screen.getByText(/your conversations stay readable/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect your own AI client →' })).toHaveAttribute(
      'href',
      '/settings/assistants'
    );
    expect(screen.queryByText(/messages left today/)).not.toBeInTheDocument();
  });

  it('shows "at 00:00" when renewsAt is the next local midnight in the Freelancer zone', () => {
    render(<AllowanceNotice state={usedUp()} />);
    expect(screen.getByText(/They renew at 00:00 your time\./)).toBeInTheDocument();
  });

  it('formats in the Freelancer zone, not the viewer zone (UTC midnight is 03:00 in Kyiv)', () => {
    render(<AllowanceNotice state={usedUp({ renewsAt: '2026-10-13T00:00:00.000Z' })} />);
    expect(screen.getByText(/They renew (tomorrow )?at 03:00 your time\./)).toBeInTheDocument();
    expect(screen.queryByText(/at 00:00/)).not.toBeInTheDocument();
  });

  it('shows "tomorrow at HH:mm" for the 24-hour mark after a zone change (next calendar day)', () => {
    // 2026-10-13T20:00Z = 23:00 on 13 Oct in Kyiv; now is 12 Oct.
    render(<AllowanceNotice state={usedUp({ renewsAt: '2026-10-13T20:00:00.000Z' })} />);
    expect(screen.getByText(/They renew tomorrow at 23:00 your time\./)).toBeInTheDocument();
  });

  it('shows "at HH:mm" when the non-midnight renewal is later the same local day', () => {
    // 2026-10-12T17:30Z = 20:30 on 12 Oct in Kyiv, same day as now (13:00).
    render(<AllowanceNotice state={usedUp({ renewsAt: '2026-10-12T17:30:00.000Z' })} />);
    expect(screen.getByText(/They renew at 20:30 your time\./)).toBeInTheDocument();
    expect(screen.queryByText(/tomorrow/)).not.toBeInTheDocument();
  });

  it('uses UTC when the zone is UTC', () => {
    render(<AllowanceNotice state={usedUp({ timeZone: 'UTC', renewsAt: '2026-10-13T00:00:00.000Z' })} />);
    expect(screen.getByText(/They renew at 00:00 your time\./)).toBeInTheDocument();
  });

  it('shows the 429 error text verbatim when given usedUpMessage', () => {
    const msg = "You've used today's 30 messages. They renew at 00:00 your time.";
    render(<AllowanceNotice state={usedUp()} usedUpMessage={msg} />);
    expect(screen.getByText(msg, { exact: false })).toBeInTheDocument();
  });

  it('offers "Create it by hand →" to /invoices/new only with handMadeLink (AC-34)', () => {
    const { rerender } = render(<AllowanceNotice state={usedUp()} />);
    expect(screen.queryByRole('link', { name: 'Create it by hand →' })).not.toBeInTheDocument();
    rerender(<AllowanceNotice state={usedUp()} handMadeLink />);
    expect(screen.getByRole('link', { name: 'Create it by hand →' })).toHaveAttribute('href', '/invoices/new');
  });
});
