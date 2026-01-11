'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { InvalidItem } from '@/store/invoice-editor-store';

export interface InvalidItemsWarningDialogProps {
  open: boolean;
  invalidItems: InvalidItem[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function InvalidItemsWarningDialog({
  open,
  invalidItems,
  onConfirm,
  onCancel,
}: InvalidItemsWarningDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Invalid Items Warning
          </AlertDialogTitle>
          <AlertDialogDescription>
            The following items cannot be saved and will be permanently removed
            when you continue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {invalidItems.length > 0 && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>
              <p className="mb-2 font-medium">
                Affected items ({invalidItems.length}):
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {invalidItems.slice(0, 5).map((invalidItem) => (
                  <li key={invalidItem.item.id} className="truncate">
                    {invalidItem.item.productName || 'Unnamed item'}
                    <span className="text-muted-foreground ml-1">
                      (
                      {invalidItem.reason === 'currency'
                        ? 'currency mismatch'
                        : 'invalid custom price'}
                      )
                    </span>
                  </li>
                ))}
                {invalidItems.length > 5 && (
                  <li>...and {invalidItems.length - 5} more</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
