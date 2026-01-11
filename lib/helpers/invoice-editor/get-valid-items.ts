import { InvalidItem } from '@/store/invoice-editor-store';
import { InvoiceFormItem } from '@/types/invoice/types';

/**
 * Get valid items (excluding invalid ones)
 */
export function getValidItems(
  items: InvoiceFormItem[],
  invalidItems: InvalidItem[]
): InvoiceFormItem[] {
  const invalidItemIds = new Set(invalidItems.map((inv) => inv.item.id));
  return items.filter((item) => !invalidItemIds.has(item.id));
}
