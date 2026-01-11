'use client';

import { Button } from '@/components/ui/button';
import { Copy, Trash2 } from 'lucide-react';

interface InvoiceItemActionsProps {
  onDuplicate: () => void;
  onDelete: () => void;
}

export function InvoiceItemActions({
  onDuplicate,
  onDelete,
}: InvoiceItemActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onDuplicate}
        title="Duplicate"
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} title="Delete">
        <Trash2 className="text-destructive h-4 w-4" />
      </Button>
    </div>
  );
}
