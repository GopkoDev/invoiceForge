import { useCallback } from 'react';
import { parseDecimalDraft } from '@/hooks/use-number-draft';
import {
  ProductOption,
  useGroupedProducts,
  useInvoiceCurrency,
  useInvoiceItem,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';
import { lineAmount } from '@/lib/helpers/invoice-calculations';

// F-01: the line total the editor shows must come from the same shared exact-decimal module the
// server stores from (AC-13), never a float `price * quantity` multiply. F-04/quantity/price are
// NaN for a moment while an invalid entry is being typed (see F-04 below); lineAmount reports
// that as 'NaN' rather than throwing, so the total mirrors it honestly.
function computeLineTotal(quantity: number, price: number): number {
  return Number(lineAmount(quantity, price));
}

interface UseInvoiceItemHandlersProps {
  itemId: string;
}

export function useInvoiceItemHandlers({
  itemId,
}: UseInvoiceItemHandlersProps) {
  const item = useInvoiceItem(itemId);
  const { updateItem, deleteItem, duplicateItem } = useInvoiceEditorActions();
  const groupedProducts = useGroupedProducts();
  const currency = useInvoiceCurrency();

  const handleProductSelect = useCallback(
    (product: ProductOption, closePopover: () => void) => {
      const price =
        product.hasCustomPrice && product.customPrice !== undefined
          ? product.customPrice
          : product.price;

      updateItem(itemId, {
        productId: product.id,
        productName: product.name,
        description: product.description || '',
        unit: product.unit,
        price,
        total: computeLineTotal(item.quantity, price),
      });
      closePopover();
    },
    [item.quantity, itemId, updateItem]
  );

  // F-04: the entered value is never silently corrected — parse it as typed (including "-" and
  // letters) and let invoiceItemSchema reject it on save, rather than stripping characters and
  // defaulting an unparseable entry to 0.
  const handleQuantityChange = useCallback(
    (value: string) => {
      const quantity = parseDecimalDraft(value);
      updateItem(itemId, {
        quantity,
        total: computeLineTotal(quantity, item.price),
      });
    },
    [item.price, itemId, updateItem]
  );

  const handlePriceChange = useCallback(
    (value: string) => {
      const price = parseDecimalDraft(value);
      updateItem(itemId, {
        price,
        total: computeLineTotal(item.quantity, price),
      });
    },
    [item.quantity, itemId, updateItem]
  );

  const handleProductNameChange = useCallback(
    (value: string) => {
      updateItem(itemId, {
        productName: value,
        description: '',
      });
    },
    [itemId, updateItem]
  );

  const handleDelete = useCallback(() => {
    deleteItem(itemId);
  }, [itemId, deleteItem]);

  const handleDuplicate = useCallback(() => {
    duplicateItem(itemId);
  }, [itemId, duplicateItem]);

  const isProductFromList = !!(item.productId && item.productId !== 'custom');
  const isCustomItem = item.productId === 'custom';

  return {
    item,
    groupedProducts,
    currency,
    handleProductSelect,
    handleQuantityChange,
    handlePriceChange,
    handleProductNameChange,
    handleDelete,
    handleDuplicate,
    isCustomItem,
    isProductFromList,
  };
}
