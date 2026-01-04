import { CustomerWithRelations } from '@/types/customer/types';
import { ContactsDetailsSidebarContent } from '@/components/layout/contacts';
import { formatFullAddress } from '@/lib/helpers';

interface CustomerInfoSidebarProps {
  customer: CustomerWithRelations;
}

export function CustomerInfoSidebar({ customer }: CustomerInfoSidebarProps) {
  const initials = customer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const fullAddress = formatFullAddress([
    customer.address,
    customer.city,
    customer.postalCode,
    customer.country,
  ]);

  const memberSince = new Date(customer.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
  });

  return (
    <ContactsDetailsSidebarContent
      avatar={{
        src: customer.image,
        fallback: initials,
        alt: customer.name,
      }}
      title={customer.name}
      subtitle={customer.companyName || 'Individual Customer'}
      badges={[{ label: customer.defaultCurrency, variant: 'secondary' }]}
      sections={[
        {
          title: 'CONTACTS',
          fields: [
            { key: 'email', label: 'Email', value: customer.email },
            { key: 'phone', label: 'Phone', value: customer.phone },
            { key: 'website', label: 'Website', value: customer.website },
          ],
        },
        {
          title: 'LOCATION',
          fields: [{ key: 'address', label: 'Address', value: fullAddress }],
        },
        {
          title: 'DETAILS',
          fields: [
            { key: 'fullName', label: 'Full Name', value: customer.name },
            {
              key: 'companyName',
              label: 'Company',
              value: customer.companyName,
            },
            { key: 'taxId', label: 'Tax ID', value: customer.taxId },
            {
              key: 'defaultCurrency',
              label: 'Default Currency',
              value: customer.defaultCurrency,
            },
          ],
        },
      ]}
      notes={customer.notes}
      statistics={[
        {
          key: 'totalInvoices',
          label: 'Total Invoices',
          value: customer._count.invoices,
        },
        {
          key: 'customPrices',
          label: 'Custom Prices',
          value: customer._count.customPrices,
        },
        { key: 'memberSince', label: 'Member Since', value: memberSince },
      ]}
    />
  );
}
