// @vitest-environment jsdom
// T24 — SCR-07 badges / drafts today / read-only explanation / lift limit, SCR-08 Draft permission checkbox.
// See docs/features/ai-assistant/tasks/t24-connect-your-ai-draft-permission-ui.md
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';

const createMock = vi.fn();
const revokeMock = vi.fn();
const liftMock = vi.fn();
vi.mock('@/lib/actions/personal-key-actions', () => ({
  createPersonalKey: (...a: unknown[]) => createMock(...a),
  revokePersonalKey: (...a: unknown[]) => revokeMock(...a),
  liftKeyDraftLimit: (...a: unknown[]) => liftMock(...a),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const goToSignInMock = vi.fn();
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: () => goToSignInMock(),
  redirectIfUnauthorized: (r: { success: boolean; code?: string }) => {
    if (!r.success && r.code === 'UNAUTHORIZED') {
      goToSignInMock();
      return true;
    }
    return false;
  },
}));

const { AssistantKeys } = await import('@/components/assistants/assistant-keys');

type Active = {
  id: string;
  name: string;
  createdAt: string;
  lastFour: string;
  lastUsedAt: string | null;
  canCreateDrafts: boolean;
  draftsToday: { created: number; allowance: number; lastLiftedAt: string | null } | null;
};

const readOnly: Active = {
  id: 'k1',
  name: 'Laptop assistant',
  createdAt: '2026-09-01T10:00:00.000Z',
  lastFour: 'a1b2',
  lastUsedAt: null,
  canCreateDrafts: false,
  draftsToday: null,
};
const drafter: Active = {
  id: 'k2',
  name: 'Drafter',
  createdAt: '2026-09-02T10:00:00.000Z',
  lastFour: 'c3d4',
  lastUsedAt: null,
  canCreateDrafts: true,
  draftsToday: { created: 12, allowance: 50, lastLiftedAt: null },
};
const lifted: Active = {
  ...drafter,
  id: 'k3',
  name: 'Lifted',
  lastFour: 'g7h8',
  draftsToday: { created: 60, allowance: 100, lastLiftedAt: '2026-10-12T08:30:00.000Z' },
};
const maxed: Active = {
  ...drafter,
  id: 'k4',
  name: 'Maxed',
  lastFour: 'i9j0',
  draftsToday: { created: 50, allowance: 50, lastLiftedAt: null },
};
const revokedDraft = {
  id: 'k5',
  name: 'Gone draft key',
  createdAt: '2026-08-01T10:00:00.000Z',
  lastFour: 'e5f6',
  lastUsedAt: null,
  canCreateDrafts: true,
  revokedAt: '2026-08-15T10:00:00.000Z',
};

const EXPLANATION =
  "Read-only keys can't be given Draft permission. To let an assistant create drafts, create a new key with Draft permission, then revoke the old one.";
const CHECKBOX = /allow this key to create draft invoices/i;
const CHECKBOX_HELP =
  "The assistant can create drafts for you to review. It can never issue or send them. You can't change this later.";

function renderKeys(active: Active[], revoked: (typeof revokedDraft)[] = []) {
  return render(
    <AssistantKeys origin="https://app.test" timeZone="UTC" keys={{ active, revoked }} />
  );
}

function row(name: string) {
  const el = screen.getByText(name).closest('[data-slot="item"]');
  if (!el) throw new Error(`row ${name} not found`);
  return within(el as HTMLElement);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SCR-07 default: badges and drafts today (AC-25, AC-28)', () => {
  it('marks each active key Can create drafts or Read-only', () => {
    renderKeys([readOnly, drafter]);
    expect(row('Laptop assistant').getByText('Read-only')).toBeTruthy();
    expect(row('Laptop assistant').queryByText('Can create drafts')).toBeNull();
    expect(row('Drafter').getByText('Can create drafts')).toBeTruthy();
    expect(row('Drafter').queryByText('Read-only')).toBeNull();
  });

  it('shows Drafts today on draft keys only, without a lift line when never lifted', () => {
    renderKeys([readOnly, drafter]);
    expect(row('Drafter').getByText('Drafts today: 12 of 50')).toBeTruthy();
    expect(row('Drafter').queryByText(/Limit last lifted/)).toBeNull();
    expect(row('Laptop assistant').queryByText(/Drafts today/)).toBeNull();
  });

  it('shows when the limit was last lifted', () => {
    renderKeys([lifted]);
    expect(row('Lifted').getByText('Drafts today: 60 of 100')).toBeTruthy();
    expect(row('Lifted').getByText(/Limit last lifted/)).toBeTruthy();
  });

  it('shows no badge and no counts on revoked keys', () => {
    renderKeys([drafter], [revokedDraft]);
    expect(screen.getAllByText('Can create drafts')).toHaveLength(1);
    expect(screen.getAllByText(/Drafts today/)).toHaveLength(1);
  });

  it('offers no Lift limit while the limit is not reached', () => {
    renderKeys([drafter, lifted]);
    expect(screen.queryByRole('button', { name: /lift limit/i })).toBeNull();
  });
});

describe('SCR-07 read-only explanation (AC-26)', () => {
  it('explains when an active key is read-only, with no way to add the permission', () => {
    renderKeys([readOnly, drafter]);
    expect(screen.getByText(EXPLANATION)).toBeTruthy();
    expect(
      row('Laptop assistant').queryByRole('button', { name: /draft|permission|allow/i })
    ).toBeNull();
    expect(row('Laptop assistant').queryByRole('checkbox')).toBeNull();
  });

  it('does not explain when only draft keys exist', () => {
    renderKeys([drafter]);
    expect(screen.queryByText(EXPLANATION)).toBeNull();
  });

  it('does not explain when there are no keys', () => {
    renderKeys([]);
    expect(screen.queryByText(EXPLANATION)).toBeNull();
  });

  it('does not explain for a revoked read-only key only', () => {
    renderKeys([drafter], [{ ...revokedDraft, canCreateDrafts: false }]);
    expect(screen.queryByText(EXPLANATION)).toBeNull();
  });
});

describe('SCR-07 limit reached and Lift limit (AC-28)', () => {
  it('reads limit reached and shows Lift limit only on that row', () => {
    renderKeys([drafter, maxed]);
    expect(row('Maxed').getByText('Drafts today: 50 of 50 · limit reached')).toBeTruthy();
    expect(row('Maxed').getByRole('button', { name: /lift limit/i })).toBeTruthy();
    expect(row('Drafter').queryByRole('button', { name: /lift limit/i })).toBeNull();
  });

  it('lifting disables the button and a double click lifts once', async () => {
    const user = userEvent.setup();
    const d = deferred<unknown>();
    liftMock.mockReturnValue(d.promise);
    renderKeys([maxed]);
    const btn = screen.getByRole('button', { name: /lift limit/i });
    await user.click(btn);
    await user.click(btn);
    expect(liftMock).toHaveBeenCalledTimes(1);
    expect(liftMock).toHaveBeenCalledWith('k4');
    expect(
      (screen.getByRole('button', { name: /lift limit/i }) as HTMLButtonElement).disabled
    ).toBe(true);
    d.resolve(ok({ created: 50, allowance: 100, lastLiftedAt: '2026-10-12T08:30:00.000Z' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it('lifted: toasts, shows the new allowance and last lift, hides the button', async () => {
    const user = userEvent.setup();
    liftMock.mockResolvedValue(
      ok({ created: 50, allowance: 100, lastLiftedAt: '2026-10-12T08:30:00.000Z' })
    );
    renderKeys([maxed]);
    await user.click(screen.getByRole('button', { name: /lift limit/i }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Limit lifted: 50 more drafts until midnight your time.'
      )
    );
    expect(await screen.findByText('Drafts today: 50 of 100')).toBeTruthy();
    expect(screen.getByText(/Limit last lifted/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /lift limit/i })).toBeNull();
  });

  it('lift-conflict: toasts the verbatim message and refreshes the list', async () => {
    const user = userEvent.setup();
    liftMock.mockResolvedValue(
      fail('CONFLICT', 'The limit can be lifted once the key has reached it.')
    );
    renderKeys([maxed]);
    await user.click(screen.getByRole('button', { name: /lift limit/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'The limit can be lifted once the key has reached it.'
      )
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it('lift-not-found: toasts Key not found. and refreshes the list', async () => {
    const user = userEvent.setup();
    liftMock.mockResolvedValue(fail('NOT_FOUND', 'Key not found.'));
    renderKeys([maxed]);
    await user.click(screen.getByRole('button', { name: /lift limit/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Key not found.'));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('UNAUTHORIZED sends the user to sign in', async () => {
    const user = userEvent.setup();
    liftMock.mockResolvedValue(fail('UNAUTHORIZED', 'Unauthorized'));
    renderKeys([maxed]);
    await user.click(screen.getByRole('button', { name: /lift limit/i }));
    await waitFor(() => expect(goToSignInMock).toHaveBeenCalled());
  });
});

describe('SCR-08 Draft permission checkbox (AC-25)', () => {
  it('is unchecked by default with the description', () => {
    renderKeys([]);
    const box = screen.getByRole('checkbox', { name: CHECKBOX });
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(CHECKBOX_HELP)).toBeTruthy();
  });

  it('creates a read-only key by default', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue(fail('VALIDATION', 'x'));
    renderKeys([]);
    await user.type(screen.getByLabelText(/key name/i), 'Plain');
    await user.click(screen.getByRole('button', { name: /create key/i }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ name: 'Plain', canCreateDrafts: false })
    );
  });

  it('passes the choice, heads the list with the badge, and resets after creation', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue(
      ok({
        key: {
          id: 'n1',
          name: 'Fresh',
          createdAt: '2026-10-12T09:00:00.000Z',
          lastFour: 'zzzz',
          lastUsedAt: null,
          canCreateDrafts: true,
        },
        fullKey: 'if_live_SECRETFULLKEYzzzz',
      })
    );
    renderKeys([readOnly]);
    await user.type(screen.getByLabelText(/key name/i), 'Fresh');
    await user.click(screen.getByRole('checkbox', { name: CHECKBOX }));
    await user.click(screen.getByRole('button', { name: /create key/i }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ name: 'Fresh', canCreateDrafts: true })
    );
    expect(await row('Fresh').findByText('Can create drafts')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: CHECKBOX }).getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('disables the name and the checkbox while creating', async () => {
    const user = userEvent.setup();
    const d = deferred<unknown>();
    createMock.mockReturnValue(d.promise);
    renderKeys([]);
    await user.type(screen.getByLabelText(/key name/i), 'Slow');
    await user.click(screen.getByRole('button', { name: /create key/i }));
    expect((screen.getByLabelText(/key name/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: CHECKBOX }).hasAttribute('disabled')).toBe(true);
    d.resolve(fail('VALIDATION', 'x'));
  });

  it('keeps the checkbox value when creation fails', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue(fail('CONFLICT', 'Too many keys'));
    renderKeys([]);
    await user.type(screen.getByLabelText(/key name/i), 'Nope');
    await user.click(screen.getByRole('checkbox', { name: CHECKBOX }));
    await user.click(screen.getByRole('button', { name: /create key/i }));
    await screen.findByText('Too many keys');
    expect(
      screen.getByRole('checkbox', { name: CHECKBOX }).getAttribute('aria-checked')
    ).toBe('true');
  });
});
