import { getPaginatedInvoices } from '@/lib/actions/invoice-actions/invoice-actions';
import { invoiceListParamsSchema } from '@/lib/validations/search-params';
import { InvoicesListContainer } from '@/components/invoices';
import { getRequestTimeZone } from '@/lib/helpers/time-zone';
import { unwrapPageResult } from '@/components/layout/content-area';

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
  const data = unwrapPageResult(result);

  const timeZone = await getRequestTimeZone();

  return <InvoicesListContainer data={data} timeZone={timeZone} />;
}
