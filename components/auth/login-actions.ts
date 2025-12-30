'use server';

import { signIn } from '@/auth';
import { loginEmailSchema } from '@/lib/validations/auth';

export async function signInWithGoogle() {
  await signIn('google');
}

export async function signInWithEmail(email: string) {
  const validation = loginEmailSchema.safeParse({ email });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0].message,
    };
  }

  await signIn('nodemailer', {
    email: validation.data.email,
    redirectTo: '/',
  });

  return { success: true };
}
