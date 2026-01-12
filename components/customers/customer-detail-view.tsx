import { protectedRoutes } from '@/config/routes.config';
import { CustomerInfoSidebar } from './customer-info-sidebar';
import { CustomerCustomPrices } from './customer-custom-prices';
import { CustomerWithRelations } from '@/types/customer/types';
import { SerializedCustomPrice } from '@/types/custom-price/types';
import { InvoiceListItem } from '@/types/invoice/types';
import {
  ContactsDetailsHeader,
  ContactsDetailsGrid,
  ContactsDetailsSidebar,
  ContactsDetailsContentLayout,
  ContactsDetailsLayout,
} from '@/components/layout/contacts';
import { RelatedInvoicesList } from '@/components/invoices';

interface CustomerDetailViewProps {
  customer: CustomerWithRelations;
  customPrices: SerializedCustomPrice[];
  invoices: InvoiceListItem[];
}

export function CustomerDetailView({
  customer,
  customPrices,
  invoices,
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
          <RelatedInvoicesList
            invoices={invoices}
            entityType="customer"
            entityId={customer.id}
            newInvoiceParams={{ customerId: customer.id }}
          />
          <CustomerCustomPrices
            customerId={customer.id}
            customPrices={customPrices}
          />
        </ContactsDetailsContentLayout>
      </ContactsDetailsGrid>
    </ContactsDetailsLayout>
  );
}
