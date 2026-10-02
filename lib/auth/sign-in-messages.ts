// Fixed sign-in messages (spec §5 AC-15, AC-16). Kept out of login-actions.ts because a
// 'use server' module may export only async functions.
export const EMAIL_SIGNIN_UNAVAILABLE =
  'Sign-in by email is temporarily unavailable. Try again shortly, or sign in with Google.';
export const EMAIL_SEND_FAILED = "We couldn't send the sign-in email. Try again.";
export const INVALID_EMAIL_ADDRESS = 'Enter a valid email address.';

// OQ-2: the `code` the direct endpoint puts on /error?error=CredentialsSignin. Client-visible,
// so value-free. A limited request is never an error and has no code.
export const SIGN_IN_ERROR_CODES = {
  invalidEmail: 'invalid_email',
  unavailable: 'email_unavailable',
  sendFailed: 'send_failed',
} as const;
