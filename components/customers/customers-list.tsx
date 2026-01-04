import { Users } from 'lucide-react';
import { CustomerCardActions } from './customer-card-actions';
import { protectedRoutes } from '@/config/routes.config';
import { ContactCard, ContactsGrid } from '@/components/layout/contacts';
import { EmptyState } from '@/components/layout/content-area/empty-state';
import { formatLocation } from '@/lib/helpers';
import { CustomerWithRelations } from '@/types/customer/types';

interface CustomersListProps {
  customers: CustomerWithRelations[];
}

export function CustomersList({ customers }: CustomersListProps) {
  if (customers.length === 0) {
    return (
      <EmptyState
        title="No Customers"
        description="Create your first customer to start issuing invoices. You can manage all your clients and their information in one place."
        href={protectedRoutes.customersNew}
        linkText="Add Customer"
        Icon={Users}
      />
    );
  }

  return (
    <ContactsGrid>
      {customers.map((customer) => {
        const location = formatLocation(customer.city, customer.country);

        return (
          <ContactCard
            key={customer.id}
            avatar={{
              src: customer.image,
              fallback: <Users className="h-6 w-6" />,
            }}
            title={customer.name}
            description={customer.companyName}
            badges={[{ label: customer.defaultCurrency, variant: 'secondary' }]}
            contactInfo={{
              email: customer.email,
              phone: customer.phone,
              location: location,
              website: customer.website,
            }}
            footer={{
              invoicesCount: customer._count.invoices,
              customPricesCount: customer._count.customPrices,
            }}
            actions={
              <CustomerCardActions
                customerId={customer.id}
                customerName={customer.name}
              />
            }
          />
        );
      })}
    </ContactsGrid>
  );
}
