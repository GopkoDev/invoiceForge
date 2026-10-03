// Fixed sign-in messages (spec §5 AC-15, AC-16). Kept out of login-actions.ts because a
// 'use server' module may export only async functions.
export const EMAIL_SIGNIN_UNAVAILABLE =
  'Sign-in by email is temporarily unavailable. Try again shortly, or sign in with Google.';
export const EMAIL_SEND_FAILED =
  "We couldn't send the sign-in email. Try again.";
export const INVALID_EMAIL_ADDRESS = 'Enter a valid email address.';

// OQ-2: the `code` the direct endpoint puts on /error?error=CredentialsSignin. Client-visible,
// so value-free. A limited request is never an error and has no code.
export const SIGN_IN_ERROR_CODES = {
  invalidEmail: 'invalid_email',
  unavailable: 'email_unavailable',
  sendFailed: 'send_failed',
} as const;

/** The message each code stands for: the /error page and the /login action show the same text. */
export const SIGN_IN_CODE_MESSAGES: Readonly<Record<string, string>> = {
  [SIGN_IN_ERROR_CODES.invalidEmail]: INVALID_EMAIL_ADDRESS,
  [SIGN_IN_ERROR_CODES.unavailable]: EMAIL_SIGNIN_UNAVAILABLE,
  [SIGN_IN_ERROR_CODES.sendFailed]: EMAIL_SEND_FAILED,
};

/**
 * The code of a sign-in refusal redirect (`…?error=CredentialsSignin&code=<code>`), when the code
 * is a known one; undefined for any other URL (sent, limited, or unparseable).
 */
export function signInRefusalCode(url: string): string | undefined {
  let params: URLSearchParams;
  try {
    params = new URL(url, 'http://localhost').searchParams;
  } catch {
    return undefined;
  }
  const code = params.get('code');
  return params.get('error') === 'CredentialsSignin' &&
    code &&
    Object.hasOwn(SIGN_IN_CODE_MESSAGES, code)
    ? code
    : undefined;
}
