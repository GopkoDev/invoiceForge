import { notFound } from 'next/navigation';
import { getCustomer } from '@/lib/actions/customer-actions';
import { CustomerDetailView } from '@/components/customers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Details',
  description: 'View customer information and activity',
};

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const result = await getCustomer(id);

  if (!result.success || !result.data) {
    notFound();
  }

  return <CustomerDetailView customer={result.data} />;
}
