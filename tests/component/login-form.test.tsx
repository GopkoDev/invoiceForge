// @vitest-environment jsdom
// AC-15, AC-16, AC-17, AC-19.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail, ok } from '@/types/actions';

const EMAIL_SIGNIN_UNAVAILABLE =
  'Sign-in by email is temporarily unavailable. Try again shortly, or sign in with Google.';
const EMAIL_SEND_FAILED = "We couldn't send the sign-in email. Try again.";

const signInWithEmailMock = vi.fn();
const signInWithGoogleMock = vi.fn();
vi.mock('@/lib/actions/login-actions', () => ({
  signInWithEmail: (...a: unknown[]) => signInWithEmailMock(...a),
  signInWithGoogle: (...a: unknown[]) => signInWithGoogleMock(...a),
}));
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a) },
}));

const { LoginForm } = await import('@/components/auth/login-form');

async function submit(email: string) {
  const user = userEvent.setup();
  render(<LoginForm />);
  await user.click(screen.getByRole('checkbox'));
  await user.type(screen.getByPlaceholderText('Enter your email'), email);
  await user.click(screen.getByRole('button', { name: /continue/i }));
}

beforeEach(() => {
  signInWithEmailMock.mockReset();
  signInWithGoogleMock.mockReset();
  toastError.mockReset();
});

describe('LoginForm provider outcomes', () => {
  it('AC-17: a server VALIDATION shows the field error under the email input, not a toast', async () => {
    signInWithEmailMock.mockResolvedValue(
      fail('VALIDATION', 'Enter a valid email address.', {
        fieldErrors: { email: ['Enter a valid email address.'] },
      })
    );
    await submit('a@example.com');
    expect(
      await screen.findByText('Enter a valid email address.')
    ).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('AC-15: unavailable toasts the message and Google stays enabled', async () => {
    signInWithEmailMock.mockResolvedValue(
      fail('FAILED', EMAIL_SIGNIN_UNAVAILABLE)
    );
    await submit('a@example.com');
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(EMAIL_SIGNIN_UNAVAILABLE)
    );
    const google = screen.getByRole('button', {
      name: /login with google/i,
    }) as HTMLButtonElement;
    expect(google.disabled).toBe(false);
  });

  it('AC-16: send failure toasts the generic message', async () => {
    signInWithEmailMock.mockResolvedValue(fail('FAILED', EMAIL_SEND_FAILED));
    await submit('a@example.com');
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(EMAIL_SEND_FAILED)
    );
  });

  it('AC-19: the button shows "Sending..." until the action returns', async () => {
    let release!: (v: unknown) => void;
    signInWithEmailMock.mockReturnValue(new Promise((r) => (release = r)));
    await submit('a@example.com');
    expect(await screen.findByText(/sending/i)).toBeTruthy();
    release(ok());
  });

  it('AC-19: Google button calls signInWithGoogle', async () => {
    signInWithGoogleMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: /login with google/i })
    );
    expect(signInWithGoogleMock).toHaveBeenCalled();
  });
});

describe('auth pages', () => {
  it('SCR-02 shows the neutral D-S1 line', async () => {
    const { default: Page } = await import('@/app/(auth)/verify-request/page');
    render(<Page />);
    expect(
      screen.getByText(
        "If this address can receive sign-in links, we've sent one. Check your inbox."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(/has been sent to your email address/i)
    ).toBeNull();
  });

  // The direct endpoint redirects to /error?error=CredentialsSignin&code=<code> (pinned against
  // the installed Auth.js in tests/integration/actions/login-actions.test.ts).
  it.each([
    ['invalid_email', 'Enter a valid email address.'],
    ['email_unavailable', EMAIL_SIGNIN_UNAVAILABLE],
    ['send_failed', EMAIL_SEND_FAILED],
  ])(
    '/error maps the direct-endpoint code %s to its fixed message',
    async (code, message) => {
      const { default: ErrorPage } = await import('@/app/(auth)/error/page');
      const ui = await ErrorPage({
        searchParams: Promise.resolve({ error: 'CredentialsSignin', code }),
      });
      render(ui);
      expect(screen.getByText(message)).toBeTruthy();
      expect(
        screen.queryByText('There is a problem with the server configuration.')
      ).toBeNull();
    }
  );

  it('/error falls back to the default message for an unknown code', async () => {
    const { default: ErrorPage } = await import('@/app/(auth)/error/page');
    const ui = await ErrorPage({
      searchParams: Promise.resolve({
        error: 'CredentialsSignin',
        code: 'toString',
      }),
    });
    render(ui);
    expect(
      screen.getByText('An error occurred during sign in. Please try again.')
    ).toBeTruthy();
  });

  it('/error keeps the existing expired-link message', async () => {
    const { default: ErrorPage } = await import('@/app/(auth)/error/page');
    const ui = await ErrorPage({
      searchParams: Promise.resolve({ error: 'Verification' }),
    });
    render(ui);
    expect(screen.getByText(/no longer valid/)).toBeTruthy();
  });
});
