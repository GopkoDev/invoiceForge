'use client';

import { startTransition, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useRouter } from 'next/navigation';
import { LoadError } from '@/components/layout/content-area/load-error';

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // F-37: reset() before refresh() re-renders the segment from the still-cached error payload
  // before the refetch lands, so the first "Try again" can never recover. refresh() has to run
  // first (kick off the refetch), reset() second (clear the boundary onto the fresh data), both
  // inside startTransition so React treats the pair as one non-blocking update.
  function handleRetry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return <LoadError onRetry={handleRetry} errorDigest={error.digest} />;
}
