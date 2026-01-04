import { protectedRoutes } from '@/config/routes.config';
import { SenderProfileInfoSidebar } from './sender-profile-info-sidebar';
import { SenderProfileRecentInvoices } from './sender-profile-recent-invoices';
import {
  SenderProfileWithRelations,
  BankAccountWithRelations,
} from '@/types/sender-profile/types';
import {
  ContactsDetailsHeader,
  ContactsDetailsGrid,
  ContactsDetailsSidebar,
  ContactsDetailsContentLayout,
  ContactsDetailsLayout,
} from '@/components/layout/contacts';
import { SenderProfileBankAccountsList } from './sender-profile-bank-accounts-list';

interface SenderProfileDetailViewProps {
  profile: SenderProfileWithRelations;
  bankAccounts: BankAccountWithRelations[];
}

export function SenderProfileDetailView({
  profile,
  bankAccounts,
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

          <SenderProfileRecentInvoices />
        </ContactsDetailsContentLayout>
      </ContactsDetailsGrid>
    </ContactsDetailsLayout>
  );
}
