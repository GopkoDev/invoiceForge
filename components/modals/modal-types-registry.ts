// Registry of all modals and their props

import type { ConfirmationModalProps } from './global-modals/confirmation-modal/types';
import type { BankAccountModalProps } from './sender-profile/bank-account-modal';
import type { CustomPriceModalProps } from './customer/custom-price-modal';
import type { CurrencyChangeWarningModalProps } from './product/currency-change-warning-modal';
import type { UnsavedChangesDialogProps } from './invoice-editor/unsaved-changes-dialog';
import type { InvalidItemsWarningDialogProps } from './invoice-editor/invalid-items-warning-dialog';
import type { ValidationErrorDialogProps } from './invoice-editor/validation-error-dialog';
import type { InvoicePdfPreviewModalProps } from './invoice/invoice-pdf-preview-modal';

export interface ModalRegistry {
  confirmationModal: ConfirmationModalProps;
  bankAccountModal: BankAccountModalProps;
  customPriceModal: CustomPriceModalProps;
  currencyChangeWarningModal: CurrencyChangeWarningModalProps;
  unsavedChangesDialog: UnsavedChangesDialogProps;
  invalidItemsWarningDialog: InvalidItemsWarningDialogProps;
  validationErrorDialog: ValidationErrorDialogProps;
  invoicePdfPreviewModal: InvoicePdfPreviewModalProps;
}
