import { protectedRoutes } from '@/config/routes.config';
import { SenderProfileInfoSidebar } from './sender-profile-info-sidebar';
import {
  SenderProfileWithRelations,
  BankAccountWithRelations,
} from '@/types/sender-profile/types';
import { InvoiceListItem } from '@/types/invoice/types';
import {
  ContactsDetailsHeader,
  ContactsDetailsGrid,
  ContactsDetailsSidebar,
  ContactsDetailsContentLayout,
  ContactsDetailsLayout,
} from '@/components/layout/contacts';
import { SenderProfileBankAccountsList } from './sender-profile-bank-accounts-list';
import { RelatedInvoicesList } from '@/components/invoices';

interface SenderProfileDetailViewProps {
  profile: SenderProfileWithRelations;
  bankAccounts: BankAccountWithRelations[];
  invoices: InvoiceListItem[];
}

export function SenderProfileDetailView({
  profile,
  bankAccounts,
  invoices,
}: SenderProfileDetailViewProps) {
  return (
    <ContactsDetailsLayout>
      <ContactsDetailsHeader
        title={profile.name}
        description={profile.legalName || 'Business Profile'}
        backHref={protectedRoutes.senderProfiles}
        editHref={protectedRoutes.senderProfileEdit(profile.id)}
        editLabel="Edit Profile"
      />

      <ContactsDetailsGrid>
        <ContactsDetailsSidebar>
          <SenderProfileInfoSidebar profile={profile} />
        </ContactsDetailsSidebar>

        <ContactsDetailsContentLayout>
          <SenderProfileBankAccountsList
            senderProfileId={profile.id}
            bankAccounts={bankAccounts}
          />

          <RelatedInvoicesList
            invoices={invoices}
            entityType="sender-profile"
            entityId={profile.id}
            newInvoiceParams={{ senderProfileId: profile.id }}
          />
        </ContactsDetailsContentLayout>
      </ContactsDetailsGrid>
    </ContactsDetailsLayout>
  );
}
