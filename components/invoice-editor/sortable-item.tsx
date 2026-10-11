'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { InvoiceItemRow } from './invoice-item-row';
import { InvoiceFormItem } from '@/types/invoice/types';

interface SortableItemProps {
  item: InvoiceFormItem;
}

export function SortableItem({ item }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <InvoiceItemRow
        itemId={item.id}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}
