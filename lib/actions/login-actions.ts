'use server';

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
} from '@/lib/auth/sign-in-messages';
import { loginEmailSchema } from '@/lib/validations/auth';
import { ActionResult, ok, fail } from '@/types/actions';

export async function signInWithGoogle() {
  await signIn('google');
}

// F-50 (T08 DoD): returns the shared ActionResult shape, with a code on failure, like every
// other server action in the app.
export async function signInWithEmail(email: string): Promise<ActionResult<void>> {
  const validation = loginEmailSchema.safeParse({ email });

  if (!validation.success) {
    return fail('VALIDATION', validation.error.issues[0].message, {
      fieldErrors: { email: [validation.error.issues[0].message] },
    });
  }

  try {
    await signIn('nodemailer', {
      email: validation.data.email,
      redirectTo: '/',
    });
  } catch (error) {
    // ADR-0001: the error type decides, never the message text. signIn() runs Auth.js in raw
    // mode, which rethrows the typed provider errors (AuthError subclasses) as-is. Anything else
    // (including NEXT_REDIRECT for sent and limited) is rethrown untouched.
    if (error instanceof InvalidEmailAddress) {
      return fail('VALIDATION', INVALID_EMAIL_ADDRESS, {
        fieldErrors: { email: [INVALID_EMAIL_ADDRESS] },
      });
    }
    if (error instanceof EmailSigninUnavailable) return fail('FAILED', EMAIL_SIGNIN_UNAVAILABLE);
    if (error instanceof EmailSendFailed) return fail('FAILED', EMAIL_SEND_FAILED);
    throw error;
  }

  return ok();
}
