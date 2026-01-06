// Registry of all modals and their props

import type { ConfirmationModalProps } from './global-modals/confirmation-modal/types';
import type { BankAccountModalProps } from './sender-profile/bank-account-modal';
import type { CustomPriceModalProps } from './customer/custom-price-modal';
import type { CurrencyChangeWarningModalProps } from './product/currency-change-warning-modal';

export interface ModalRegistry {
  confirmationModal: ConfirmationModalProps;
  bankAccountModal: BankAccountModalProps;
  customPriceModal: CustomPriceModalProps;
  currencyChangeWarningModal: CurrencyChangeWarningModalProps;
}
