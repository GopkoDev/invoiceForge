'use client';

import { startTransition, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useRouter } from 'next/navigation';
import { LoadError } from '@/components/layout/content-area/load-error';

export default function InvoiceEditorError({
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

  // F-37 (see app/(protected)/error.tsx, same fix): refresh() before reset(), both inside
  // startTransition, so retry actually recovers instead of re-rendering the cached failure.
  function handleRetry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return <LoadError onRetry={handleRetry} errorDigest={error.digest} />;
}
