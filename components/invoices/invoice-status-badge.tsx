'use client';

import { Badge } from '@/components/ui/badge';
import { InvoiceStatus, invoiceStatusConfig } from '@/types/invoice/types';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  // T35 (AC-18, F-15): the moment the status became Paid. Shown only for a Paid invoice.
  paidAt?: Date | string | null;
}

// Formats consistently on server and client, matching InvoicesDataTable's own date columns.
function formatPaidDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
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
