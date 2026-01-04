import { ContentAreaHeader } from '@/components/layout/content-area';
import { ProductForm } from '@/components/products';
import type { Metadata } from 'next';
import { PAGE_HEADER_TEXT } from './_constants';

export const metadata: Metadata = {
  title: 'New Product',
  description: 'Add a new product or service',
};

const { title, description } = PAGE_HEADER_TEXT;

export default function NewProductPage() {
  return (
    <>
      <ContentAreaHeader title={title} description={description} />

      <ProductForm />
    </>
  );
}

