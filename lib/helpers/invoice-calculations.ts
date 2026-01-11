export interface InvoiceItem {
  total: number;
}

export interface InvoiceTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function calculateSubtotal(items: InvoiceItem[]): number {
  return items.reduce((sum, item) => sum + item.total, 0);
}

export function calculateTaxAmount(
  subtotal: number,
  discount: number,
  shipping: number,
  taxRate: number
): number {
  return (subtotal - discount + shipping) * (taxRate / 100);
}

export function calculateTotal(
  subtotal: number,
  taxAmount: number,
  discount: number,
  shipping: number
): number {
  return subtotal + taxAmount - discount + shipping;
}

export function calculateInvoiceTotals(
  items: InvoiceItem[],
  taxRate: number,
  discount: number,
  shipping: number
): InvoiceTotals {
  const subtotal = calculateSubtotal(items);
  const taxAmount = calculateTaxAmount(subtotal, discount, shipping, taxRate);
  const total = calculateTotal(subtotal, taxAmount, discount, shipping);

  return { subtotal, taxAmount, total };
}
