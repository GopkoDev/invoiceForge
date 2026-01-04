import { ContentAreaHeader } from '@/components/layout/content-area';
import { getCustomers } from '@/lib/actions/customer-actions';
import { CustomersList } from '@/components/customers';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { PAGE_HEADER_TEXT } from './_constants';

export const metadata: Metadata = {
  title: 'Customers',
  description: 'Manage your customers and clients',
};

const { title, description, buttonText } = PAGE_HEADER_TEXT;

export default async function CustomersPage() {
  const result = await getCustomers();

  if (!result.success) {
    return notFound();
  }

  const customers = result.data || [];

  return (
    <>
      <ContentAreaHeader
        title={title}
        description={description}
        rightContent={
          <Link
            href={protectedRoutes.customersNew}
            className={cn(buttonVariants())}
          >
            <Plus />
            {buttonText}
          </Link>
        }
      />

      <CustomersList customers={customers} />
    </>
  );
}
