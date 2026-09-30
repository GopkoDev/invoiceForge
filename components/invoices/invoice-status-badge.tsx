'use client';

import { Badge } from '@/components/ui/badge';
import { InvoiceStatus, invoiceStatusConfig } from '@/types/invoice/types';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  // T35 (AC-18, F-15): the moment the status became Paid. Shown only for a Paid invoice.
  paidAt?: Date | string | null;
}

// Pinned to UTC so the SSR pass and the browser format the same instant as the same day (N-16,
// review-2026-09-28); an un-zoned toLocaleDateString differs between server and client zones.
function formatPaidDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function InvoiceStatusBadge({ status, paidAt }: InvoiceStatusBadgeProps) {
  const config = invoiceStatusConfig[status];

  return (
    <Badge variant={config.variant}>
      {config.label}
      {status === 'PAID' && paidAt && ` ${formatPaidDate(paidAt)}`}
    </Badge>
  );
}
