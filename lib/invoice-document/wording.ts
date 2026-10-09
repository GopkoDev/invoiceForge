// T9 (AC-10; ADR-0002) — every fixed label the invoice document says. The HTML preview and the PDF
// lay out the model built from these; neither holds a literal of its own.
export const WORDING = {
  title: 'INVOICE',
  date: 'Date:',
  due: 'Due:',
  po: 'PO:',
  from: 'From',
  to: 'To',
  taxId: 'Tax ID:',
  columns: { product: 'Product / Service', price: 'Price', quantity: 'Qty', amount: 'Amount' },
  untitled: 'Untitled',
  subtotal: 'Subtotal:',
  discount: 'Discount:',
  shipping: 'Shipping:',
  tax: (rate: number) => `Tax (${rate}%):`,
  total: 'TOTAL:',
  notes: 'Notes',
  terms: 'Payment Terms',
  bank: 'Payment Information',
  accountNumber: 'Account number:',
  iban: 'IBAN:',
  swift: 'SWIFT:',
} as const;
