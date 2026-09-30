import { ContentAreaHeader, unwrapPageResult } from '@/components/layout/content-area';
import { ProductForm } from '@/components/products';
import { getProduct } from '@/lib/actions/product-actions';
import type { Metadata } from 'next';
import { PAGE_HEADER_TEXT } from './_constants';

const { title, description } = PAGE_HEADER_TEXT;

export const metadata: Metadata = {
  title: 'Edit Product',
  description: 'Update product information',
};

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;
  const result = await getProduct(id);
  const product = unwrapPageResult(result);

  const defaultValues = {
    ...product,
    price: String(product.price),
  };

  return (
    <>
      <ContentAreaHeader title={title} description={description} />

      <ProductForm
        defaultValues={defaultValues}
        isEditing
        invoiceItemsCount={product._count.invoiceItems}
        customPricesCount={product._count.customPrices}
      />
    </>
  );
}
