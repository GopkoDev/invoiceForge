import { ContentArea } from '@/components/layout/content-area/content-area';
import { CustomerModalContainer } from '@/components/modals/customer/customer-modal-container';

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ContentArea>{children}</ContentArea>

      <CustomerModalContainer />
    </>
  );
}

