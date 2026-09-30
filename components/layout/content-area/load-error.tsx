'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';

interface LoadErrorProps {
  onRetry: () => void | Promise<void>;
  // Carried by segment `error.tsx` boundaries so the digest is available to future
  // support tooling, but it must never be rendered — see the edge case "Error message
  // contains SQL text: never displayed, only the plain-language copy" (T25 AC-28).
  errorDigest?: string;
  // The boundary's useTransition isPending: true while the refresh is in flight (SCR-17
  // "retrying"), since a synchronous onRetry returns before the refetch lands.
  retrying?: boolean;
}

export function LoadError({ onRetry, retrying = false }: LoadErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const busy = retrying || isRetrying;

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangle />
        </EmptyMedia>
        <EmptyTitle>We couldn&apos;t load your data</EmptyTitle>
        <EmptyDescription>
          Something went wrong on our side. Your data is safe. Try again.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={handleRetry} disabled={busy}>
          {busy ? <Spinner /> : null}
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  );
}
