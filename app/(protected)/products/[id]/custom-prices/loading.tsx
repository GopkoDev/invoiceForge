import { ContentAreaHeaderLoading } from '@/components/layout/content-area';
import { ProductCustomPricesTableLoading } from '@/components/products/product-custom-prices-loading';

export default function ProductCustomPricesLoading() {
  return (
    <>
      <ContentAreaHeaderLoading
        titleText="Custom Prices - Product Name"
        descriptionText="Default price: €0.00 per unit"
        buttonText="Add Custom Price"
      />

      <ProductCustomPricesTableLoading />
    </>
  );
}
