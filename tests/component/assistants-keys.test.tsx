// @vitest-environment jsdom
// T21 — SCR-03 key states (create form, one-time reveal, key lists) and SCR-04 revoke confirmation.
// See docs/features/mcp-server/tasks/t21-key-create-reveal-and-revoke-ui.md
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';

const createMock = vi.fn();
const revokeMock = vi.fn();
vi.mock('@/lib/actions/personal-key-actions', () => ({
  createPersonalKey: (...a: unknown[]) => createMock(...a),
  revokePersonalKey: (...a: unknown[]) => revokeMock(...a),
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
const { KEY_NAME_MESSAGE, KEY_LIMIT_MESSAGE } = await import(
  '@/lib/validations/personal-key'
);

type Active = {
  id: string;
  name: string;
  createdAt: string;
  lastFour: string;
  lastUsedAt: string | null;
};
const laptop: Active = {
  id: 'k1',
  name: 'Laptop assistant',
  createdAt: '2026-09-01T10:00:00.000Z',
  lastFour: 'a1b2',
  lastUsedAt: '2026-09-20T14:30:00.000Z',
};
const unused: Active = {
  id: 'k2',
  name: 'Desktop',
  createdAt: '2026-09-02T10:00:00.000Z',
  lastFour: 'c3d4',
  lastUsedAt: null,
};
const old = {
  id: 'k3',
  name: 'Old key',
  createdAt: '2026-08-01T10:00:00.000Z',
  lastFour: 'e5f6',
  lastUsedAt: null,
  revokedAt: '2026-08-15T10:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function renderKeys(list: { active: Active[]; revoked: (typeof old)[] }) {
  return render(
    <AssistantKeys origin="https://app.test" timeZone="UTC" keys={list} />
  );
}

const FULL = 'if_live_SECRETFULLKEY1234';

function created(name: string, id: string, fullKey: string) {
  return ok({
    key: {
      id,
      name,
      createdAt: '2026-10-04T09:00:00.000Z',
      lastFour: fullKey.slice(-4),
      lastUsedAt: null,
    },
    fullKey,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SCR-03 key-name hint', () => {
  const HINT = "1 to 50 characters, e.g. the device or assistant it's for.";

  it('shows the hint under the name and hides it while the error shows (AC-03)', async () => {
    const user = userEvent.setup();
    renderKeys({ active: [], revoked: [] });
    expect(screen.getByText(HINT)).toBeTruthy();
    await user.type(screen.getByLabelText(/name/i), '   ');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(KEY_NAME_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe('SCR-03 default / empty', () => {
  it('lists active keys with name, created date, lastFour, last use, Revoke (AC-05)', () => {
    renderKeys({ active: [laptop, unused], revoked: [old] });
    expect(screen.getByText('Active keys (2 of 10)')).toBeTruthy();
    expect(screen.getByText('Laptop assistant')).toBeTruthy();
    expect(screen.getByText(/Created Sep 1, 2026/)).toBeTruthy();
    expect(screen.getByText('••••a1b2')).toBeTruthy();
    expect(screen.getByText(/Last used Sep 20, 2026/)).toBeTruthy();
    expect(screen.getByText('Never used')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(2);
  });

  it('lists revoked keys separately with revocation date and no action (AC-05, AC-06)', () => {
    renderKeys({ active: [laptop], revoked: [old] });
    expect(screen.getByText('Old key')).toBeTruthy();
    expect(screen.getByText('••••e5f6')).toBeTruthy();
    expect(screen.getByText(/Revoked Aug 15, 2026/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(1);
  });

  it('shows the empty state and hides the revoked section with no keys', () => {
    renderKeys({ active: [], revoked: [] });
    expect(
      screen.getByText(
        'No keys yet. Create one above to connect your first assistant.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Revoked keys/)).toBeNull();
  });
});

describe('create', () => {
  it('shows the creating state, then the one-time reveal with warning, filled snippets and a never-used row (AC-02)', async () => {
    const d = deferred<unknown>();
    createMock.mockReturnValue(d.promise);
    const user = userEvent.setup();
    renderKeys({ active: [], revoked: [] });
    expect(document.body.textContent).toContain('YOUR_KEY');

    const input = screen.getByLabelText(/name/i) as HTMLInputElement;
    await user.type(input, 'Laptop assistant');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(
      (screen.getByRole('button', { name: /create/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(input.disabled).toBe(true);

    d.resolve(created('Laptop assistant', 'n1', FULL));
    await screen.findByText('Your new key "Laptop assistant"');
    expect(
      screen.getByText("Copy it now. You won't be able to see it again.")
    ).toBeTruthy();
    expect((screen.getByDisplayValue(FULL) as HTMLInputElement).readOnly).toBe(
      true
    );
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('YOUR_KEY');
    expect(document.body.textContent).toContain(`Bearer ${FULL}`);
    expect(screen.getByText('Never used')).toBeTruthy();
    expect(screen.getByText('••••1234')).toBeTruthy();
    expect(input.value).toBe('');
    expect(createMock).toHaveBeenCalledWith({ name: 'Laptop assistant' });
  });

  it('the full key is gone after a remount and the snippets show YOUR_KEY again (AC-02)', async () => {
    createMock.mockResolvedValueOnce(created('Fresh', 'n1', FULL));
    const user = userEvent.setup();
    const first = renderKeys({ active: [], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), 'Fresh');
    await user.click(screen.getByRole('button', { name: /create/i }));
    await screen.findByDisplayValue(FULL);
    first.unmount();
    cleanup();
    renderKeys({ active: [], revoked: [] });
    expect(screen.queryByDisplayValue(FULL)).toBeNull();
    expect(document.body.textContent).not.toContain(FULL);
    expect(document.body.textContent).toContain('YOUR_KEY');
  });

  it('a second create replaces the reveal with the newer key', async () => {
    const user = userEvent.setup();
    renderKeys({ active: [], revoked: [] });
    createMock.mockResolvedValueOnce(created('First', 'a', 'if_live_AAAA1111'));
    await user.type(screen.getByLabelText(/name/i), 'First');
    await user.click(screen.getByRole('button', { name: /create/i }));
    await screen.findByText('Your new key "First"');
    createMock.mockResolvedValueOnce(created('Second', 'b', 'if_live_BBBB2222'));
    await user.type(screen.getByLabelText(/name/i), 'Second');
    await user.click(screen.getByRole('button', { name: /create/i }));
    await screen.findByText('Your new key "Second"');
    expect(screen.queryByText('Your new key "First"')).toBeNull();
    expect(screen.queryByDisplayValue('if_live_AAAA1111')).toBeNull();
    expect(screen.getByDisplayValue('if_live_BBBB2222')).toBeTruthy();
  });

  it('client validation shows KEY_NAME_MESSAGE, keeps the name, calls nothing (AC-03)', async () => {
    const user = userEvent.setup();
    renderKeys({ active: [], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), '   ');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(KEY_NAME_MESSAGE)).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('server VALIDATION shows the message verbatim and keeps the typed name (AC-03)', async () => {
    createMock.mockResolvedValue(
      fail('VALIDATION', KEY_NAME_MESSAGE, {
        fieldErrors: { name: [KEY_NAME_MESSAGE] },
      })
    );
    const user = userEvent.setup();
    renderKeys({ active: [laptop], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), '  laptop ASSISTANT ');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(KEY_NAME_MESSAGE)).toBeTruthy();
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe(
      '  laptop ASSISTANT '
    );
    expect(screen.queryByText(/Your new key/)).toBeNull();
  });

  it('limit CONFLICT shows an alert, keeps Revoke, clears on next submit (AC-04)', async () => {
    createMock.mockResolvedValueOnce(fail('CONFLICT', KEY_LIMIT_MESSAGE));
    const user = userEvent.setup();
    renderKeys({ active: [laptop], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), 'Eleventh');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(KEY_LIMIT_MESSAGE)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(1);

    createMock.mockReturnValueOnce(deferred<unknown>().promise);
    await user.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() =>
      expect(screen.queryByText(KEY_LIMIT_MESSAGE)).toBeNull()
    );
  });

  it('FAILED toasts verbatim and keeps the name', async () => {
    createMock.mockResolvedValue(fail('FAILED', 'raw'));
    const user = userEvent.setup();
    renderKeys({ active: [], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), 'Keep me');
    await user.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Could not create the key. Try again.'
      )
    );
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe(
      'Keep me'
    );
  });

  it('UNAUTHORIZED goes to sign-in', async () => {
    createMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));
    const user = userEvent.setup();
    renderKeys({ active: [], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), 'X');
    await user.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(goToSignInMock).toHaveBeenCalled());
  });
});

describe('SCR-04 revoke confirmation', () => {
  async function openRevoke(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getAllByRole('button', { name: /^Revoke/ })[0]);
    return await screen.findByRole('dialog');
  }

  it('default copy, cancel keeps the key active', async () => {
    const user = userEvent.setup();
    renderKeys({ active: [laptop], revoked: [] });
    const dialog = await openRevoke(user);
    expect(within(dialog).getByText('Revoke "Laptop assistant"?')).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Any assistant using this key stops working right away. This can't be undone: you'll need a new key to reconnect."
      )
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(revokeMock).not.toHaveBeenCalled();
    expect(screen.getByText('Active keys (1 of 10)')).toBeTruthy();
  });

  it('pending disables both buttons, then success moves the row to revoked with a toast', async () => {
    const d = deferred<unknown>();
    revokeMock.mockReturnValue(d.promise);
    const user = userEvent.setup();
    renderKeys({ active: [laptop, unused], revoked: [] });
    const dialog = await openRevoke(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' })
    );
    expect(
      (within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (within(dialog).getByRole('button', { name: /Revoke key/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByRole('dialog')).toBeTruthy();

    d.resolve(ok());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(revokeMock).toHaveBeenCalledWith('k1');
    expect(toastSuccess).toHaveBeenCalledWith('Key revoked.');
    expect(screen.getByText('Active keys (1 of 10)')).toBeTruthy();
    expect(screen.getByText(/Revoked keys/)).toBeTruthy();
    expect(screen.getByText(/^Revoked [A-Z][a-z]{2} \d/)).toBeTruthy();
  });

  it('revoking the revealed key removes the reveal too', async () => {
    createMock.mockResolvedValueOnce(created('Fresh', 'n1', FULL));
    revokeMock.mockResolvedValue(ok());
    const user = userEvent.setup();
    renderKeys({ active: [], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), 'Fresh');
    await user.click(screen.getByRole('button', { name: /create/i }));
    await screen.findByText('Your new key "Fresh"');
    const dialog = await openRevoke(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' })
    );
    await waitFor(() =>
      expect(screen.queryByText('Your new key "Fresh"')).toBeNull()
    );
    expect(document.body.textContent).not.toContain(FULL);
  });

  it('keeps the dialog title while closing and focuses the Active keys heading after success', async () => {
    revokeMock.mockResolvedValue(ok());
    const user = userEvent.setup();
    renderKeys({ active: [laptop, unused], revoked: [] });
    const dialog = await openRevoke(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' })
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const closing = screen.queryByRole('dialog');
    if (closing) {
      expect(within(closing).queryByText('Revoke ""?')).toBeNull();
    }
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: /^Active keys/ })
      )
    );
  });

  it('revoking after a limit refusal clears the limit alert (AC-04, AC-06)', async () => {
    createMock.mockResolvedValueOnce(fail('CONFLICT', KEY_LIMIT_MESSAGE));
    revokeMock.mockResolvedValue(ok());
    const user = userEvent.setup();
    renderKeys({ active: [laptop], revoked: [] });
    await user.type(screen.getByLabelText(/name/i), 'Eleventh');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(KEY_LIMIT_MESSAGE)).toBeTruthy();
    const dialog = await openRevoke(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' })
    );
    await waitFor(() =>
      expect(screen.queryByText(KEY_LIMIT_MESSAGE)).toBeNull()
    );
  });

  it('NOT_FOUND toasts verbatim, closes and refreshes the list', async () => {
    revokeMock.mockResolvedValue(fail('NOT_FOUND', 'x'));
    const user = userEvent.setup();
    renderKeys({ active: [laptop], revoked: [] });
    const dialog = await openRevoke(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' })
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Key not found.')
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(refreshMock).toHaveBeenCalled();
  });

  it('UNAUTHORIZED goes to sign-in', async () => {
    revokeMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));
    const user = userEvent.setup();
    renderKeys({ active: [laptop], revoked: [] });
    const dialog = await openRevoke(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' })
    );
    await waitFor(() => expect(goToSignInMock).toHaveBeenCalled());
  });

  it('a rejected revoke goes to sign-in', async () => {
    revokeMock.mockRejectedValue(new Error('401'));
    const user = userEvent.setup();
    renderKeys({ active: [laptop], revoked: [] });
    const dialog = await openRevoke(user);
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' })
    );
    await waitFor(() => expect(goToSignInMock).toHaveBeenCalled());
  });
});
