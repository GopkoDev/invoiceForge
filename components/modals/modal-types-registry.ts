// Registry of all modals and their props

import type { ConfirmationModalProps } from './global-modals/confirmation-modal/types';
import type { BankAccountModalProps } from './sender-profile/bank-account-modal';

export interface ModalRegistry {
  confirmationModal: ConfirmationModalProps;
  bankAccountModal: BankAccountModalProps;
}
