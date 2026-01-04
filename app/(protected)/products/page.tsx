import { ContentAreaHeader } from '@/components/layout/content-area';
import { getProducts } from '@/lib/actions/product-actions';
import { ProductsList } from '@/components/products';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { PAGE_HEADER_TEXT } from './_constants';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Manage your products and services catalog',
};

const { title, description, buttonText } = PAGE_HEADER_TEXT;

export default async function ProductsPage() {
  const result = await getProducts();

  if (!result.success) {
    return notFound();
  }

  const products = result.data || [];

  return (
    <>
      <ContentAreaHeader
        title={title}
        description={description}
        rightContent={
          <Link
            href={protectedRoutes.productsNew}
            className={cn(buttonVariants())}
          >
            <Plus />
            {buttonText}
          </Link>
        }
      />

      <ProductsList products={products} />
    </>
  );
}
