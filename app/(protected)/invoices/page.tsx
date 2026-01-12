import {
  InvoiceSearchParams,
  InvoiceTab,
  InvoiceSortField,
  SortDirection,
  InvoiceStatus,
} from '@/types/invoice/types';
import { getPaginatedInvoices } from '@/lib/actions/invoice-actions/invoice-actions';
import { InvoicesListContainer } from '@/components/invoices';
import { Card, CardContent } from '@/components/ui/card';

interface InvoicesPageProps {
  searchParams: Promise<InvoiceSearchParams>;
}

export default async function InvoicesPage({
  searchParams,
}: InvoicesPageProps) {
  const params = await searchParams;

  const query = {
    page: Number(params.page) || 1,
    pageSize: Number(params.pageSize) || 10,
    tab: (params.tab as InvoiceTab) || 'all',
    search: params.search || '',
    status: (params.status as InvoiceStatus | 'all') || 'all',
    sortField: (params.sortBy ||
      params.sortField ||
      'createdAt') as InvoiceSortField,
    sortDirection: (params.sortOrder ||
      params.sortDirection ||
      'desc') as SortDirection,
    dateFrom: params.dateFrom || '',
    dateTo: params.dateTo || '',
    customerId: params.customerId || '',
    senderProfileId: params.senderProfileId || '',
  };

  const result = await getPaginatedInvoices(query);

  if (!result.success || !result.data) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground">
            {result.error || 'Failed to load invoices'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return <InvoicesListContainer data={result.data} />;
}
