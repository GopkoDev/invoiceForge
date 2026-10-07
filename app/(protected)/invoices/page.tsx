import { getPaginatedInvoices } from '@/lib/actions/invoice-actions/invoice-actions';
import { invoiceListParamsSchema } from '@/lib/validations/search-params';
import { InvoicesListContainer } from '@/components/invoices';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
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

  // ADR-0006: the account zone, not the tz cookie (which only seeds the first visit). Resolved before
  // the list is read: the first-visit seed also normalises the legacy invoice dates (T35), and the
  // list must not read them first.
  const { timeZone } = unwrapPageResult(await actingFreelancerFromSession());

  const result = await getPaginatedInvoices(query);
  const data = unwrapPageResult(result);

  return <InvoicesListContainer data={data} timeZone={timeZone} />;
}
