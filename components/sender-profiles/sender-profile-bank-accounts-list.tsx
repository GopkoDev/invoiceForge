'use client';

import { Button } from '@/components/ui/button';
import { Landmark, CreditCard } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  ContactsDetailsContentCard,
  DetailListItem,
} from '@/components/layout/contacts';
import { AddBankAccountButton } from './add-bank-account-button';
import { protectedRoutes } from '@/config/routes.config';
import Link from 'next/link';
import { BankAccountWithRelations } from '@/types/sender-profile/types';

interface SenderProfileBankAccountsListProps {
  senderProfileId: string;
  bankAccounts: BankAccountWithRelations[];
}

export function SenderProfileBankAccountsList({
  senderProfileId,
  bankAccounts,
}: SenderProfileBankAccountsListProps) {
  return (
    <ContactsDetailsContentCard
      title="Bank Accounts"
      description="Payment accounts for this profile"
      headerAction={<AddBankAccountButton senderProfileId={senderProfileId} />}
      emptyState={{
        icon: Landmark,
        title: 'No Bank Accounts',
        description:
          'Add at least one bank account to start issuing invoices. You can have multiple accounts in different currencies.',
        actionButton: (
          <AddBankAccountButton senderProfileId={senderProfileId}>
            Add Bank Account
          </AddBankAccountButton>
        ),
      }}
      showEmpty={bankAccounts.length === 0}
    >
      <div className="space-y-4">
        {bankAccounts.map((account, index) => (
          <div key={account.id}>
            {index > 0 && <Separator className="mb-4" />}
            <DetailListItem
              icon={Landmark}
              title={account.bankName}
              badges={[
                ...(account.isDefault
                  ? [{ label: 'Default', variant: 'default' as const }]
                  : []),
                { label: account.currency, variant: 'secondary' as const },
              ]}
              details={[
                {
                  icon: CreditCard,
                  value: account.accountNumber,
                },
                ...(account.iban
                  ? [
                      {
                        label: 'IBAN',
                        value: account.iban,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ))}

        <Separator />

        <div className="flex justify-center">
          <Link
            href={protectedRoutes.senderProfileEditBankAccounts(
              senderProfileId
            )}
          >
            <Button variant="outline" size="sm">
              Manage Bank Accounts
            </Button>
          </Link>
        </div>
      </div>
    </ContactsDetailsContentCard>
  );
}
