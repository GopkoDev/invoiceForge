import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { AlertCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';
import {
  EMAIL_SEND_FAILED,
  EMAIL_SIGNIN_UNAVAILABLE,
  INVALID_EMAIL_ADDRESS,
  SIGN_IN_ERROR_CODES,
} from '@/lib/auth/sign-in-messages';
import { authRoutes } from '@/config/routes.config';

export const metadata: Metadata = {
  title: 'Sign in error',
};

interface ErrorPageProps {
  searchParams: Promise<{
    error?: string;
    code?: string;
  }>;
}

const errorMessages: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Server error',
    description: 'There is a problem with the server configuration.',
  },
  AccessDenied: {
    title: 'Access denied',
    description: 'You do not have permission to sign in.',
  },
  Verification: {
    title: 'Unable to sign in',
    description:
      'The sign in link is no longer valid. It may have been used already or it may have expired.',
  },
  Default: {
    title: 'Unable to sign in',
    description: 'An error occurred during sign in. Please try again.',
  },
};

// OQ-2: the direct POST /api/auth/signin/nodemailer reports the typed provider errors as
// ?error=CredentialsSignin&code=<code>, so direct callers get the same distinct messages as /login.
const signInCodeMessages: Record<string, string> = {
  [SIGN_IN_ERROR_CODES.invalidEmail]: INVALID_EMAIL_ADDRESS,
  [SIGN_IN_ERROR_CODES.unavailable]: EMAIL_SIGNIN_UNAVAILABLE,
  [SIGN_IN_ERROR_CODES.sendFailed]: EMAIL_SEND_FAILED,
};

function resolveError(error: string | undefined, code: string | undefined) {
  if (error === 'CredentialsSignin' && code && Object.hasOwn(signInCodeMessages, code)) {
    return { title: 'Unable to sign in', description: signInCodeMessages[code] };
  }
  return (error && Object.hasOwn(errorMessages, error) && errorMessages[error]) || errorMessages.Default;
}

export default async function ErrorPage({ searchParams }: ErrorPageProps) {
  const params = await searchParams;
  const errorInfo = resolveError(params.error, params.code);

  return (
    <div className="flex flex-col gap-6">
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircleIcon className="size-6 text-destructive" />
        </div>
        <CardDescription className="text-base font-semibold">
          {errorInfo.title}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-muted-foreground mb-6 text-sm">
          {errorInfo.description}
        </p>
          <Link
            href={authRoutes.signIn}
            className={cn(buttonVariants(), 'w-full')}
          >
          Sign in
        </Link>
      </CardContent>
    </Card>
    </div>
  );
}
