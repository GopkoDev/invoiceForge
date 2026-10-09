'use client';

import { Button } from '@/components/ui/button';
import { Copy, Trash2 } from 'lucide-react';

interface InvoiceItemActionsProps {
  onDuplicate: () => void;
  onDelete: () => void;
  /** The line's current 1-based position, announced in the button names. */
  lineNumber: number;
}

export function InvoiceItemActions({
  onDuplicate,
  onDelete,
  lineNumber,
}: InvoiceItemActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onDuplicate}
        title="Duplicate"
        aria-label={`Duplicate line ${lineNumber}`}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        title="Delete"
        aria-label={`Delete line ${lineNumber}`}
      >
        <Trash2 className="text-destructive h-4 w-4" />
      </Button>
    </div>
  );
}
