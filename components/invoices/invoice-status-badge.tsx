'use client';

import { Badge } from '@/components/ui/badge';
import { InvoiceStatus, invoiceStatusConfig } from '@/types/invoice/types';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  // T35 (AC-18, F-15): the moment the status became Paid. Shown only for a Paid invoice.
  paidAt?: Date | string | null;
  // R-07 (AC-18, ADR-0010): the Freelancer's zone from the `tz` cookie; defaults to UTC.
  timeZone?: string;
}

// Always formatted in an explicit zone so the SSR pass and the browser agree (N-16); the zone
// is the cookie-carried one (R-07), UTC when none is passed.
function formatPaidDate(date: Date | string, timeZone: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function InvoiceStatusBadge({ status, paidAt, timeZone = 'UTC' }: InvoiceStatusBadgeProps) {
  const config = invoiceStatusConfig[status];

  return (
    <Badge variant={config.variant}>
      {config.label}
      {status === 'PAID' && paidAt && ` ${formatPaidDate(paidAt, timeZone)}`}
    </Badge>
  );
}
