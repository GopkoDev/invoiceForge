import { LoginForm } from '@/components/auth/login-form';
import { signInReturnPath } from '@/lib/auth/sign-in-return-path';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
};

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;
  return <LoginForm returnPath={signInReturnPath(callbackUrl)} />;
}
