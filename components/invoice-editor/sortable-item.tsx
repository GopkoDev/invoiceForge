'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { InvoiceItemRow } from './invoice-item-row';
import { InvoiceItemCard } from './invoice-item-card';
import { InvoiceFormItem } from '@/types/invoice/types';

interface SortableItemProps {
  item: InvoiceFormItem;
  isMobile: boolean;
}

export function SortableItem({ item, isMobile }: SortableItemProps) {
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

  if (isMobile) {
    return (
      <div ref={setNodeRef} style={style}>
        <InvoiceItemCard
          itemId={item.id}
          dragHandleProps={{ attributes, listeners }}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <InvoiceItemRow
        itemId={item.id}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}
