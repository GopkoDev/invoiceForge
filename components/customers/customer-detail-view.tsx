import { protectedRoutes } from '@/config/routes.config';
import { CustomerInfoSidebar } from './customer-info-sidebar';
import { CustomerRecentInvoices } from './customer-recent-invoices';
import { CustomerCustomPrices } from './customer-custom-prices';
import { CustomerWithRelations } from '@/types/customer/types';
import { SerializedCustomPrice } from '@/types/custom-price/types';
import {
  ContactsDetailsHeader,
  ContactsDetailsGrid,
  ContactsDetailsSidebar,
  ContactsDetailsContentLayout,
  ContactsDetailsLayout,
} from '@/components/layout/contacts';

interface CustomerDetailViewProps {
  customer: CustomerWithRelations;
  customPrices: SerializedCustomPrice[];
}

export function CustomerDetailView({
  customer,
  customPrices,
}: CustomerDetailViewProps) {
  return (
    <ContactsDetailsLayout>
      <ContactsDetailsHeader
        title={customer.name}
        description={customer.companyName || 'Individual'}
        backHref={protectedRoutes.customers}
        editHref={protectedRoutes.customerEdit(customer.id)}
        editLabel="Edit Customer"
      />

      <ContactsDetailsGrid>
        <ContactsDetailsSidebar>
          <CustomerInfoSidebar customer={customer} />
        </ContactsDetailsSidebar>

        <ContactsDetailsContentLayout>
          <CustomerRecentInvoices />
          <CustomerCustomPrices
            customerId={customer.id}
            customPrices={customPrices}
          />
        </ContactsDetailsContentLayout>
      </ContactsDetailsGrid>
    </ContactsDetailsLayout>
  );
}
