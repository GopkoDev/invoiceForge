import { getCustomer } from '@/lib/actions/customer-actions';
import { getCustomerCustomPrices } from '@/lib/actions/custom-price-actions';
import { getInvoicesByCustomer } from '@/lib/actions/invoice-actions/invoice-actions';
import { CustomerDetailView } from '@/components/customers';
import { unwrapPageResult } from '@/components/layout/content-area';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Details',
  description: 'View customer information and activity',
};

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

const PREVIEW_INVOICES_LIMIT = 5;

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;

  const [customerResult, customPricesResult, invoicesResult] =
    await Promise.all([
      getCustomer(id),
      getCustomerCustomPrices(id),
      getInvoicesByCustomer(id, PREVIEW_INVOICES_LIMIT),
    ]);

  // The record first, so a missing or foreign customer is not-found, not a load error.
  const customer = unwrapPageResult(customerResult);
  const customPrices = unwrapPageResult(customPricesResult);
  const invoices = unwrapPageResult(invoicesResult);

  return (
    <CustomerDetailView
      customer={customer}
      customPrices={customPrices}
      invoices={invoices}
    />
  );
}
