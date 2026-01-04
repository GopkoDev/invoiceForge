import { ContentAreaHeader } from '@/components/layout/content-area';
import { CustomerForm } from '@/components/customers';
import type { Metadata } from 'next';
import { PAGE_HEADER_TEXT } from './_constants';

export const metadata: Metadata = {
  title: 'New Customer',
  description: 'Add a new customer or client',
};

const { title, description } = PAGE_HEADER_TEXT;

export default function NewCustomerPage() {
  return (
    <>
      <ContentAreaHeader title={title} description={description} />

      <CustomerForm />
    </>
  );
}
