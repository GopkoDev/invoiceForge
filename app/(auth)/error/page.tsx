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
import { authRoutes } from '@/config/routes.config';

export const metadata: Metadata = {
  title: 'Sign in error',
};

interface ErrorPageProps {
  searchParams: Promise<{
    error?: string;
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

export default async function ErrorPage({ searchParams }: ErrorPageProps) {
  const params = await searchParams;
  const error = params.error || 'Default';
  const errorInfo =
    errorMessages[error as keyof typeof errorMessages] || errorMessages.Default;

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
