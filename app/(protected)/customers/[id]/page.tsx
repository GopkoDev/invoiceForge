import { notFound } from 'next/navigation';
import { getCustomer } from '@/lib/actions/customer-actions';
import { getCustomerCustomPrices } from '@/lib/actions/custom-price-actions';
import { getInvoicesByCustomer } from '@/lib/actions/invoice-actions/invoice-actions';
import { CustomerDetailView } from '@/components/customers';
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

  if (!customerResult.success || !customerResult.data) {
    notFound();
  }

  return (
    <CustomerDetailView
      customer={customerResult.data}
      customPrices={customPricesResult.data || []}
      invoices={invoicesResult.data || []}
    />
  );
}
