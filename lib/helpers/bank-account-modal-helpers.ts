import { toast } from 'sonner';
import {
  createBankAccount,
  updateBankAccount,
} from '@/lib/actions/bank-account-actions';
import {
  goToSignIn,
  redirectIfUnauthorized,
} from '@/lib/helpers/client-session-redirect';
import { BankAccountFormValues } from '@/lib/validations/bank-account';

/**
 * Handle bank account form submission
 * @param senderProfileId - The ID of the sender profile
 * @param data - Form data
 * @param isEditing - Whether editing existing account
 * @param accountId - The ID of the account to edit (if editing)
 * @param onSuccess - Callback function on success
 */
/** What the bank account dialog does next: close on a save, or stay open with field errors. */
export interface BankAccountSubmitOutcome {
  saved: boolean;
  fieldErrors?: Record<string, string[]>;
}

export async function handleBankAccountSubmit(
  senderProfileId: string,
  data: BankAccountFormValues,
  isEditing: boolean,
  accountId?: string,
  onSuccess?: () => void
): Promise<BankAccountSubmitOutcome> {
  try {
    const result =
      isEditing && accountId
        ? await updateBankAccount(accountId, data)
        : await createBankAccount(senderProfileId, data);

    if (!result.success) {
      if (redirectIfUnauthorized(result)) return { saved: false };
      // invoice-integrity T19 (SCR-10): a currency lock (HAS_INVOICES) or a refused unset lands under
      // its field and keeps the dialog open; anything else (e.g. a default race) is a toast.
      if (result.fieldErrors) return { saved: false, fieldErrors: result.fieldErrors };
      toast.error(result.error || 'Failed to save bank account');
      return { saved: false };
    }

    toast.success(
      isEditing
        ? 'Bank account updated successfully'
        : 'Bank account created successfully'
    );

    if (onSuccess) {
      onSuccess();
    }
    return { saved: true };
  } catch {
    // AC-21: a rejected call is treated like UNAUTHORIZED.
    goToSignIn();
    return { saved: false };
  }
}
