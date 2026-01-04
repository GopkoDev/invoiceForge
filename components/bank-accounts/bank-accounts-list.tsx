'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Banknote,
  Building2,
  CreditCard,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { deleteBankAccount } from '@/lib/actions/bank-account-actions';
import { useModal } from '@/store/use-modal-store';
import { BankAccountField } from './bank-account-field';
import { BankAccountWithRelations } from '@/types/sender-profile/types';
import { BankAccountFormValues } from '@/lib/validations/bank-account';
import { handleBankAccountSubmit } from '@/lib/helpers';

interface BankAccountsListProps {
  senderProfileId: string;
  bankAccounts: BankAccountWithRelations[];
}

export function BankAccountsList({
  senderProfileId,
  bankAccounts,
}: BankAccountsListProps) {
  const router = useRouter();
  const confirmationModal = useModal('confirmationModal');
  const bankAccountModal = useModal('bankAccountModal');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bankAccountModalOnFormSubmit = (accountId?: string) => {
    return async (data: BankAccountFormValues, isEditing: boolean) => {
      await handleBankAccountSubmit(
        senderProfileId,
        data,
        isEditing,
        accountId,
        () => {
          router.refresh();
        }
      );
    };
  };

  const handleDelete = async (account: BankAccountWithRelations) => {
    const { id, bankName } = account;

    confirmationModal.open({
      open: true,
      title: 'Delete Bank Account',
      description: `Are you sure you want to delete bank account from "${bankName}"? This action cannot be undone.`,
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onClose: confirmationModal.close,
      onConfirm: async () => {
        setDeletingId(id);
        const result = await deleteBankAccount(id);

        if (!result.success) {
          toast.error(result.error || 'Failed to delete bank account');
        } else {
          toast.success('Bank account deleted successfully');
          router.refresh();
        }
        setDeletingId(null);
      },
    });
  };

  const handleEdit = (account: BankAccountWithRelations) => {
    bankAccountModal.open({
      open: true,
      close: bankAccountModal.close,
      senderProfileId,
      onFormSubmit: bankAccountModalOnFormSubmit(account.id),
      defaultValues: {
        bankName: account.bankName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        iban: account.iban || '',
        swift: account.swift || '',
        currency: account.currency,
        isDefault: account.isDefault,
      },
      isEditing: true,
    });
  };

  const handleAdd = () => {
    bankAccountModal.open({
      open: true,
      close: bankAccountModal.close,
      senderProfileId,
      onFormSubmit: bankAccountModalOnFormSubmit(),
      defaultValues: undefined,
      isEditing: false,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Bank Accounts</CardTitle>
              <CardDescription>
                Manage bank accounts for this sender profile
              </CardDescription>
            </div>
            <Button onClick={handleAdd} size="sm">
              <Plus className="h-4 w-4" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Banknote className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Bank Accounts</h3>
              <p className="text-muted-foreground mb-6 max-w-md text-sm">
                Add at least one bank account to start issuing invoices. You can
                have multiple accounts in different currencies.
              </p>
              <Button onClick={handleAdd} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Bank Account
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {bankAccounts.map((account) => (
                <Card key={account.id}>
                  <CardHeader>
                    <div className="flex items-center  gap-4">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>

                      <div className="flex-1">
                        <CardTitle>{account.bankName}</CardTitle>
                        <CardDescription>{account.accountName}</CardDescription>
                      </div>

                      {account.isDefault && (
                        <Badge variant="default">Default</Badge>
                      )}

                      <ButtonGroup>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleEdit(account)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit account</span>
                              </Button>
                            }
                          />
                          <TooltipContent>Edit account</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleDelete(account)}
                                disabled={deletingId === account.id}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete account</span>
                              </Button>
                            }
                          />
                          <TooltipContent>Delete account</TooltipContent>
                        </Tooltip>
                      </ButtonGroup>
                    </div>
                  </CardHeader>

                  <Separator />

                  <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <BankAccountField
                        icon={<CreditCard className="h-4 w-4" />}
                        label="Account Number"
                        value={account.accountNumber}
                        noDataLabel="No account number"
                      />

                      <BankAccountField
                        icon={<span className="font-bold">IB</span>}
                        label="IBAN"
                        value={account.iban}
                        noDataLabel="No IBAN"
                      />

                      <BankAccountField
                        icon={<span className="font-bold">SW</span>}
                        label="SWIFT/BIC"
                        value={account.swift}
                        noDataLabel="No SWIFT/BIC"
                      />

                      <BankAccountField
                        icon={<FileText className="h-4 w-4" />}
                        label="Currency & Usage"
                        value={
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{account.currency}</span>
                            {account._count.invoices > 0 && (
                              <span className="text-xs text-muted-foreground">
                                • {account._count.invoices} invoices
                              </span>
                            )}
                          </div>
                        }
                        noDataLabel="No currency"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
