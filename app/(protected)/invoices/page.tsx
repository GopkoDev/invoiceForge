import { getPaginatedInvoices } from '@/lib/actions/invoice-actions/invoice-actions';
import { invoiceListParamsSchema } from '@/lib/validations/search-params';
import { InvoicesListContainer } from '@/components/invoices';
import { Card, CardContent } from '@/components/ui/card';

interface InvoicesPageProps {
  // Next.js searchParams: raw, untrusted, string | string[] | undefined per key — never cast, a
  // bad/tampered link is parsed with fallback-to-default schemas so it never throws (AC-26).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InvoicesPage({
  searchParams,
}: InvoicesPageProps) {
  const rawParams = await searchParams;
  const query = invoiceListParamsSchema.parse(rawParams);

  const result = await getPaginatedInvoices(query);

  if (!result.success) {
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
