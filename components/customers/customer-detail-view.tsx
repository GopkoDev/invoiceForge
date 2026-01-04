import { protectedRoutes } from '@/config/routes.config';
import { CustomerInfoSidebar } from './customer-info-sidebar';
import { CustomerRecentInvoices } from './customer-recent-invoices';
import { CustomerCustomPrices } from './customer-custom-prices';
import { CustomerWithRelations } from '@/types/customer/types';
import {
  ContactsDetailsHeader,
  ContactsDetailsGrid,
  ContactsDetailsSidebar,
  ContactsDetailsContentLayout,
  ContactsDetailsLayout,
} from '@/components/layout/contacts';

interface CustomerDetailViewProps {
  customer: CustomerWithRelations;
}

export function CustomerDetailView({ customer }: CustomerDetailViewProps) {
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
          <CustomerCustomPrices />
        </ContactsDetailsContentLayout>
      </ContactsDetailsGrid>
    </ContactsDetailsLayout>
  );
}
