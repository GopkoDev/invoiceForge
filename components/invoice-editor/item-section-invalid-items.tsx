import { useCallback } from 'react';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  useInvalidItems,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';

export function ItemSectionInvalidItems() {
  const invalidItems = useInvalidItems();
  const { deleteItem } = useInvoiceEditorActions();

  const handleRemoveInvalidItem = useCallback(
    (itemId: string) => {
      deleteItem(itemId);
    },
    [deleteItem]
  );

  const handleRemoveAllInvalidItems = useCallback(() => {
    invalidItems.forEach((inv) => {
      deleteItem(inv.item.id);
    });
  }, [invalidItems, deleteItem]);

  if (invalidItems.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Invalid Items ({invalidItems.length})</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          These items will be removed when you save because they have currency
          mismatch or invalid custom prices:
        </p>
        <div className="space-y-2">
          {invalidItems.map(({ item, reason }) => (
            <div
              key={item.id}
              className="bg-destructive/10 flex items-center justify-between rounded-md p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {item.productName || 'Unnamed item'}
                </p>
                <p className="text-xs opacity-80">
                  {reason === 'currency'
                    ? 'Currency does not match invoice currency'
                    : 'Custom price not available for selected customer'}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 shrink-0"
                onClick={() => handleRemoveInvalidItem(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        {invalidItems.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={handleRemoveAllInvalidItems}
          >
            Remove All Invalid Items
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
