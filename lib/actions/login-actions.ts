'use server';

import * as Sentry from '@sentry/nextjs';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import {
  EmailSendFailed,
  EmailSigninUnavailable,
  InvalidEmailAddress,
} from '@/lib/auth/email-provider';
import {
  EMAIL_SEND_FAILED,
  EMAIL_SIGNIN_UNAVAILABLE,
  INVALID_EMAIL_ADDRESS,
  SIGN_IN_CODE_MESSAGES,
  SIGN_IN_ERROR_CODES,
  signInRefusalCode,
} from '@/lib/auth/sign-in-messages';
import { signInReturnPath } from '@/lib/auth/sign-in-return-path';
import { loginEmailSchema } from '@/lib/validations/auth';
import { ActionResult, fail } from '@/types/actions';

// AC-19: `returnPath` is the page the Visitor asked for before the proxy sent them to /login;
// signInReturnPath() keeps it to a path on this app.
export async function signInWithGoogle(returnPath?: string) {
  await signIn('google', { redirectTo: signInReturnPath(returnPath) });
}

const invalidEmail = () =>
  fail('VALIDATION', INVALID_EMAIL_ADDRESS, {
    fieldErrors: { email: [INVALID_EMAIL_ADDRESS] },
  });

// F-50 (T08 DoD): returns the shared ActionResult shape, with a code on failure, like every
// other server action in the app.
export async function signInWithEmail(
  email: string,
  returnPath?: string
): Promise<ActionResult<void>> {
  const validation = loginEmailSchema.safeParse({ email });

  if (!validation.success) {
    return fail('VALIDATION', validation.error.issues[0].message, {
      fieldErrors: { email: [validation.error.issues[0].message] },
    });
  }

  let target: string;
  try {
    target = (await signIn('nodemailer', {
      email: validation.data.email,
      redirectTo: signInReturnPath(returnPath),
      redirect: false,
    })) as string;
  } catch (error) {
    // ADR-0001: the error type decides, never the message text. signIn() runs Auth.js in raw
    // mode, which rethrows the typed provider errors (AuthError subclasses) as-is.
    if (error instanceof InvalidEmailAddress) return invalidEmail();
    if (error instanceof EmailSigninUnavailable)
      return fail('FAILED', EMAIL_SIGNIN_UNAVAILABLE);
    if (error instanceof EmailSendFailed)
      return fail('FAILED', EMAIL_SEND_FAILED);
    // The database Auth.js's own adapter calls need is unreachable (AC-15). Reported like every
    // other unavailable path, with the typed error and no value-bearing data.
    if (error instanceof AuthError && error.type === 'AdapterError') {
      Sentry.captureException(new EmailSigninUnavailable());
      return fail('FAILED', EMAIL_SIGNIN_UNAVAILABLE);
    }
    throw error;
  }

  // callbacks.signIn refuses an uncheckable request by redirecting to the error
  // page with a code; /login shows that code's message in place. Sent and limited requests both
  // get the same redirect to check-your-inbox (no enumeration), so they are followed untouched.
  const code = signInRefusalCode(target);
  if (code === SIGN_IN_ERROR_CODES.invalidEmail) return invalidEmail();
  if (code) return fail('FAILED', SIGN_IN_CODE_MESSAGES[code]);
  return redirect(target);
}
