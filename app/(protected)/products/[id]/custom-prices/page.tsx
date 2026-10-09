import { getProduct } from '@/lib/actions/product-actions';
import { getProductCustomPrices } from '@/lib/actions/custom-price-actions';
import { ProductCustomPrices } from '@/components/products/product-custom-prices';
import { ContentAreaHeader, unwrapPageResult } from '@/components/layout/content-area';
import { formatCurrency, getUnitLabel } from '@/lib/helpers/format-helpers';
import { ProductCustomPricesHeaderAction } from '@/components/products/product-custom-prices-header-action';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
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

  const [actorResult, productResult, customPricesResult] = await Promise.all([
    actingFreelancerFromSession(),
    getProduct(id),
    getProductCustomPrices(id),
  ]);

  const { timeZone } = unwrapPageResult(actorResult);
  const product = unwrapPageResult(productResult);
  const customPrices = unwrapPageResult(customPricesResult);

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
        customPrices={customPrices}
        timeZone={timeZone}
      />
    </>
  );
}
