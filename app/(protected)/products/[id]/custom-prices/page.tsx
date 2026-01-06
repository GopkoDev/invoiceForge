import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/actions/product-actions';
import { getProductCustomPrices } from '@/lib/actions/custom-price-actions';
import { ProductCustomPrices } from '@/components/products/product-custom-prices';
import { ContentAreaHeader } from '@/components/layout/content-area';
import { formatCurrency, getUnitLabel } from '@/lib/helpers/format-helpers';
import { ProductCustomPricesHeaderAction } from '@/components/products/product-custom-prices-header-action';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Product Custom Prices',
  description: 'Manage custom prices for this product',
};

interface ProductCustomPricesPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductCustomPricesPage({
  params,
}: ProductCustomPricesPageProps) {
  const { id } = await params;

  const [productResult, customPricesResult] = await Promise.all([
    getProduct(id),
    getProductCustomPrices(id),
  ]);

  if (!productResult.success || !productResult.data) {
    notFound();
  }

  const product = productResult.data;

  return (
    <>
      <ContentAreaHeader
        title={`Custom Prices - ${product.name}`}
        description={`Default price: ${formatCurrency(
          product.price,
          product.currency
        )} per ${getUnitLabel(product.unit)}`}
        rightContent={
          <ProductCustomPricesHeaderAction
            productId={product.id}
            productPrice={product.price}
            productCurrency={product.currency}
            productUnit={product.unit}
          />
        }
      />

      <ProductCustomPrices
        productId={product.id}
        productName={product.name}
        productPrice={product.price}
        productCurrency={product.currency}
        productUnit={product.unit}
        customPrices={customPricesResult.data || []}
      />
    </>
  );
}
