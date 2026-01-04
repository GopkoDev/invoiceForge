import { toast } from 'sonner';
import {
  createBankAccount,
  updateBankAccount,
} from '@/lib/actions/bank-account-actions';
import { BankAccountFormValues } from '@/lib/validations/bank-account';

/**
 * Handle bank account form submission
 * @param senderProfileId - The ID of the sender profile
 * @param data - Form data
 * @param isEditing - Whether editing existing account
 * @param accountId - The ID of the account to edit (if editing)
 * @param onSuccess - Callback function on success
 */
export async function handleBankAccountSubmit(
  senderProfileId: string,
  data: BankAccountFormValues,
  isEditing: boolean,
  accountId?: string,
  onSuccess?: () => void
) {
  try {
    const result =
      isEditing && accountId
        ? await updateBankAccount(accountId, data)
        : await createBankAccount(senderProfileId, data);

    if (!result.success) {
      toast.error(result.error || 'Failed to save bank account');
      return;
    }

    toast.success(
      isEditing
        ? 'Bank account updated successfully'
        : 'Bank account created successfully'
    );

    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    toast.error('An unexpected error occurred');
    console.error('Bank account submit error:', error);
  }
}
