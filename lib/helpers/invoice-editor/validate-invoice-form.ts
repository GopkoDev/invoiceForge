import { InvoiceFormData } from '@/types/invoice/types';
import { invoiceFormSchema } from '@/lib/validations/invoice';

export function validateInvoiceForm(formData: InvoiceFormData): string[] {
  const result = invoiceFormSchema.safeParse(formData);

  if (result.success) {
    return [];
  }

  const errors: string[] = [];
  result.error.issues.forEach((issue) => {
    errors.push(issue.message);
  });

  return errors;
}
