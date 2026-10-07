'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { dismissOverdueRuleNotice } from '@/lib/actions/dashboard-actions';
import { goToSignIn, redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';

export function OverdueRuleNotice() {
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);

  if (dismissed) return null;

  const onDismiss = async () => {
    setPending(true);
    try {
      const result = await dismissOverdueRuleNotice();
      if (!result.success) {
        if (redirectIfUnauthorized(result)) return;
        toast.error(result.error);
        return;
      }
      setDismissed(true);
    } catch {
      // AC-21: a rejected call is treated like UNAUTHORIZED.
      goToSignIn();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="px-4 lg:px-6">
      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>Overdue is now automatic</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Pending invoices past their due date now count as overdue on their own: here, in your
            invoice list and in your AI assistant&apos;s answers. The invoice itself doesn&apos;t
            change, and you can still mark it paid.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            disabled={pending}
            onClick={onDismiss}
          >
            Got it
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
