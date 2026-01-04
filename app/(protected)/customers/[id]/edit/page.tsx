import { ContentAreaHeader } from '@/components/layout/content-area';
import { CustomerForm } from '@/components/customers';
import { getCustomer } from '@/lib/actions/customer-actions';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PAGE_HEADER_TEXT } from './_constants';

const { title, description } = PAGE_HEADER_TEXT;

export const metadata: Metadata = {
  title: 'Edit Customer',
  description: 'Update customer information',
};

interface EditCustomerPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCustomerPage({
  params,
}: EditCustomerPageProps) {
  const { id } = await params;
  const result = await getCustomer(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const customer = result.data;

  const defaultValues = customer;

  return (
    <>
      <ContentAreaHeader title={title} description={description} />

      <CustomerForm defaultValues={defaultValues} isEditing />
    </>
  );
}
