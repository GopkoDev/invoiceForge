'use client';

import { Badge } from '@/components/ui/badge';
import { InvoiceStatus, invoiceStatusConfig } from '@/types/invoice/types';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = invoiceStatusConfig[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
