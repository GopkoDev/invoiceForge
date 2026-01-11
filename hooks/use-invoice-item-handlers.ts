import { useCallback } from 'react';
import {
  ProductOption,
  useGroupedProducts,
  useInvoiceCurrency,
  useInvoiceItem,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';

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
        total: price * item.quantity,
      });
      closePopover();
    },
    [item.quantity, itemId, updateItem]
  );

  const handleQuantityChange = useCallback(
    (value: string) => {
      const sanitized = value.replace(/[^\d.]/g, '');
      const quantity = parseFloat(sanitized) || 0;
      updateItem(itemId, {
        quantity,
        total: item.price * quantity,
      });
    },
    [item.price, itemId, updateItem]
  );

  const handlePriceChange = useCallback(
    (value: string) => {
      const sanitized = value.replace(/[^\d.]/g, '');
      const price = parseFloat(sanitized) || 0;
      updateItem(itemId, {
        price,
        total: price * item.quantity,
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
