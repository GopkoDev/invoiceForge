'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Calendar,
  DollarSign,
  Plus,
  Download,
  Printer,
  Eye,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContactsDetailsContentCard,
  DetailListItem,
} from '@/components/layout/contacts';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { InvoiceListItem } from '@/types/invoice/types';
import { formatCurrency } from '@/lib/helpers/format-helpers';
import { protectedRoutes } from '@/config/routes.config';
import { useModal } from '@/store/use-modal-store';
import { getInvoice } from '@/lib/actions/invoice-actions/invoice-actions';
import {
  downloadInvoicePdf,
  printInvoicePdf,
} from '@/lib/helpers/invoice-pdf-helpers';
import { toast } from 'sonner';

interface RelatedInvoicesListProps {
  invoices: InvoiceListItem[];
  entityType: 'customer' | 'sender-profile';
  entityId: string;
  newInvoiceParams?: Record<string, string>;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function InvoiceItemActions({ invoiceId }: { invoiceId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const invoicePdfPreviewModal = useModal('invoicePdfPreviewModal');

  const handleView = useCallback(async () => {
    setIsLoading(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (result.success && result.data) {
        invoicePdfPreviewModal.open({ invoice: result.data });
      } else {
        toast.error(result.error || 'Failed to load invoice');
      }
    } catch {
      toast.error('Failed to load invoice');
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId, invoicePdfPreviewModal]);

  const handleDownload = useCallback(async () => {
    setIsLoading(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to load invoice');
        return;
      }
      await downloadInvoicePdf(result.data);
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  const handlePrint = useCallback(async () => {
    setIsLoading(true);
    setOpen(false);
    try {
      const result = await getInvoice(invoiceId);
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to load invoice');
        return;
      }
      await printInvoicePdf(result.data);
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={handleView} disabled={isLoading}>
          <Eye className="size-4" />
          View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload} disabled={isLoading}>
          <Download className="size-4" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrint} disabled={isLoading}>
          <Printer className="size-4" />
          Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RelatedInvoicesList({
  invoices,
  entityType,
  entityId,
  newInvoiceParams,
}: RelatedInvoicesListProps) {
  const hasInvoices = invoices.length > 0;

  const title =
    entityType === 'customer' ? 'Recent Invoices' : 'Recent Invoices';
  const description =
    entityType === 'customer'
      ? 'Latest invoices for this customer'
      : 'Latest invoices from this profile';
  const emptyDescription =
    entityType === 'customer'
      ? 'No invoices have been created for this customer yet. Create the first invoice to get started.'
      : 'No invoices have been created with this sender profile yet. Create the first invoice to get started.';

  const newInvoiceHref = newInvoiceParams
    ? `${protectedRoutes.invoicesNew}?${new URLSearchParams(newInvoiceParams).toString()}`
    : protectedRoutes.invoicesNew;

  const viewAllHref =
    entityType === 'customer'
      ? `${protectedRoutes.invoices}?customerId=${entityId}`
      : `${protectedRoutes.invoices}?senderProfileId=${entityId}`;

  return (
    <ContactsDetailsContentCard
      title={title}
      description={description}
      headerAction={
        <Link href={newInvoiceHref}>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        </Link>
      }
      showEmpty={!hasInvoices}
      emptyState={{
        icon: FileText,
        title: 'No Invoices',
        description: emptyDescription,
        action: {
          label: 'Create Invoice',
          href: newInvoiceHref,
        },
      }}
    >
      <div className="space-y-4">
        {invoices.slice(0, 5).map((invoice, index) => (
          <div key={invoice.id}>
            {index > 0 && <Separator className="mb-4" />}
            <DetailListItem
              icon={FileText}
              title={
                <Link
                  href={protectedRoutes.invoiceEdit(invoice.id)}
                  className="hover:underline"
                >
                  {invoice.invoiceNumber}
                </Link>
              }
              badges={[
                {
                  content: <InvoiceStatusBadge status={invoice.status} />,
                },
              ]}
              details={[
                {
                  icon: Calendar,
                  value: formatDate(invoice.issueDate),
                },
                {
                  icon: DollarSign,
                  value: formatCurrency(invoice.total, invoice.currency),
                },
              ]}
              detailsLayout="horizontal"
              actions={<InvoiceItemActions invoiceId={invoice.id} />}
            />
          </div>
        ))}

        {invoices.length > 0 && (
          <div className="flex justify-center pt-2">
            <Link href={viewAllHref}>
              <Button variant="outline" size="sm">
                View All Invoices
              </Button>
            </Link>
          </div>
        )}
      </div>
    </ContactsDetailsContentCard>
  );
}
