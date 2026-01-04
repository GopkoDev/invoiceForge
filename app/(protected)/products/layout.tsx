import { ContentArea } from '@/components/layout/content-area/content-area';
import { ProductModalContainer } from '@/components/modals/product/product-modal-container';

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ContentArea>{children}</ContentArea>

      <ProductModalContainer />
    </>
  );
}

