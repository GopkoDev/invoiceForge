// @vitest-environment jsdom
// T20 — Connect your AI: setup steps, example prompts, Settings nav entry.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings/assistants' }));
vi.mock('@/components/modals/settings/settings-modal-container', () => ({
  SettingsModalContainer: () => null,
}));

import { SetupSteps } from '@/components/assistants/setup-steps';
import { ExamplePrompts } from '@/components/assistants/example-prompts';
import SettingsLayout from '@/app/(protected)/settings/layout';
import { protectedRoutes } from '@/config/routes.config';

afterEach(cleanup);

const ORIGIN = 'https://app.example.com';

describe('SetupSteps', () => {
  it('renders three client tabs', () => {
    render(<SetupSteps origin={ORIGIN} />);
    expect(screen.getByRole('tab', { name: 'Claude Code' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Cursor' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Claude Desktop' })).toBeTruthy();
  });

  it('Claude Code panel: user-scope command with YOUR_KEY placeholder', () => {
    render(<SetupSteps origin={ORIGIN} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain(
      `claude mcp add --transport http --scope user invoice-forge ${ORIGIN}/api/mcp --header "Authorization: Bearer YOUR_KEY"`
    );
    expect(text).toContain(
      'Keep the key in your user settings, never in a project file.'
    );
  });

  it('Cursor and Claude Desktop panels use global config and the placeholder', async () => {
    const user = userEvent.setup();
    render(<SetupSteps origin={ORIGIN} />);
    await user.click(screen.getByRole('tab', { name: 'Cursor' }));
    let text = document.body.textContent ?? '';
    expect(text).toContain('~/.cursor/mcp.json');
    expect(text).toContain('Bearer YOUR_KEY');
    await user.click(screen.getByRole('tab', { name: 'Claude Desktop' }));
    text = document.body.textContent ?? '';
    expect(text).toContain('claude_desktop_config.json');
    expect(text).toContain('mcp-remote');
    expect(text).toContain('Bearer YOUR_KEY');
  });

  it('replaces YOUR_KEY with fullKey in every snippet', async () => {
    const user = userEvent.setup();
    render(<SetupSteps origin={ORIGIN} fullKey="ifk_abc123" />);
    for (const name of ['Claude Code', 'Cursor', 'Claude Desktop']) {
      await user.click(screen.getByRole('tab', { name }));
      const text = document.body.textContent ?? '';
      expect(text).toContain('Bearer ifk_abc123');
      expect(text).not.toContain('YOUR_KEY');
    }
  });
});

describe('ExamplePrompts', () => {
  it('shows the three prompts each with a copy button', () => {
    render(<ExamplePrompts />);
    expect(screen.getByText('Try asking')).toBeTruthy();
    expect(
      screen.getByText(
        'Who owes me money right now, and how many days overdue is each invoice?'
      )
    ).toBeTruthy();
    expect(screen.getByText('Which payments am I expecting this month?')).toBeTruthy();
    expect(
      screen.getByText("Give me this month's totals: invoiced, paid and overdue.")
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Copy/ })).toHaveLength(3);
  });
});

describe('Settings nav', () => {
  it('links Connect your AI to /settings/assistants', () => {
    expect(protectedRoutes.settingsAssistants).toBe('/settings/assistants');
    render(
      <SettingsLayout>
        <div />
      </SettingsLayout>
    );
    const link = screen.getByRole('link', { name: 'Connect your AI' });
    expect(link.getAttribute('href')).toBe('/settings/assistants');
  });
});
