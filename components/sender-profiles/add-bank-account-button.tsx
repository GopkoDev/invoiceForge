'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useModal } from '@/store/use-modal-store';
import { handleBankAccountSubmit } from '@/lib/helpers';
import { BankAccountFormValues } from '@/lib/validations/bank-account';

interface AddBankAccountButtonProps {
  senderProfileId: string;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
  onSuccess?: () => void;
  /** The profile has no account yet: the new one becomes its default (SCR-10). */
  isFirstAccount?: boolean;
}

export function AddBankAccountButton({
  senderProfileId,
  variant = 'default',
  size = 'sm',
  children,
  onSuccess,
  isFirstAccount = false,
}: AddBankAccountButtonProps) {
  const router = useRouter();
  const bankAccountModal = useModal('bankAccountModal');

  const handleClick = () => {
    bankAccountModal.open({
      open: true,
      close: bankAccountModal.close,
      senderProfileId,
      isFirst: isFirstAccount,
      onFormSubmit: async (data: BankAccountFormValues) => {
        return handleBankAccountSubmit(
          senderProfileId,
          data,
          false,
          undefined,
          () => {
            router.refresh();
            onSuccess?.();
          }
        );
      },
    });
  };

  return (
    <Button variant={variant} size={size} onClick={handleClick}>
      <Plus className="h-4 w-4" />
      {children || 'Add Account'}
    </Button>
  );
}
