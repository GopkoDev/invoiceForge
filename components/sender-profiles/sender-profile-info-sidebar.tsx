import { ContactsDetailsSidebarContent } from '@/components/layout/contacts';
import { Building2 } from 'lucide-react';
import { SenderProfileWithRelations } from '@/types/sender-profile/types';
import { formatFullAddress } from '@/lib/helpers';

interface SenderProfileInfoSidebarProps {
  profile: SenderProfileWithRelations;
}

export function SenderProfileInfoSidebar({
  profile,
}: SenderProfileInfoSidebarProps) {
  const fullAddress = formatFullAddress([
    profile.address,
    profile.city,
    profile.postalCode,
    profile.country,
  ]);

  const badges: Array<{
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
  }> = [{ label: profile.invoicePrefix, variant: 'secondary' }];

  if (profile.isDefault) {
    badges.push({ label: 'Default', variant: 'default' });
  }

  return (
    <ContactsDetailsSidebarContent
      avatar={{
        src: profile.logo,
        fallback: <Building2 className="h-10 w-10" />,
        alt: profile.name,
      }}
      title={profile.name}
      subtitle={profile.legalName || 'Business Profile'}
      badges={badges}
      sections={[
        {
          title: 'CONTACTS',
          fields: [
            { key: 'email', label: 'Email', value: profile.email },
            { key: 'phone', label: 'Phone', value: profile.phone },
            { key: 'website', label: 'Website', value: profile.website },
          ],
        },
        {
          title: 'LOCATION',
          fields: [{ key: 'address', label: 'Address', value: fullAddress }],
        },
        {
          title: 'DETAILS',
          fields: [
            { key: 'companyName', label: 'Company Name', value: profile.name },
            { key: 'legalName', label: 'Legal Name', value: profile.legalName },
            { key: 'taxId', label: 'Tax ID', value: profile.taxId },
            {
              key: 'invoicePrefix',
              label: 'Invoice Prefix',
              value: profile.invoicePrefix,
            },
          ],
        },
      ]}
      statistics={[
        {
          key: 'totalInvoices',
          label: 'Total Invoices',
          value: profile._count.invoices,
        },
        {
          key: 'bankAccounts',
          label: 'Bank Accounts',
          value: profile._count.bankAccounts,
        },
      ]}
    />
  );
}
