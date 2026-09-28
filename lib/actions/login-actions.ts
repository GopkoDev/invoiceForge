'use server';

import { signIn } from '@/auth';
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

  await signIn('nodemailer', {
    email: validation.data.email,
    redirectTo: '/',
  });

  return ok();
}
