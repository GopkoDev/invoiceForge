'use client';

import { useEffect } from 'react';
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

  function handleRetry() {
    reset();
    router.refresh();
  }

  return <LoadError onRetry={handleRetry} errorDigest={error.digest} />;
}
