'use client';

import { useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Plus } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useInvoiceItems,
  useInvalidItems,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';
import { SortableItem } from './sortable-item';
import { ItemSectionInvalidItems } from './item-section-invalid-items';

function ItemsEmptyState() {
  return (
    <div className="text-muted-foreground py-8 text-center">
      <Package className="mx-auto mb-2 h-12 w-12 opacity-50" />
      <p>Add items or services</p>
    </div>
  );
}

export function ItemsSection() {
  const isMobile = useIsMobile();

  const items = useInvoiceItems();
  const invalidItems = useInvalidItems();
  const { addItem, addCustomItem, reorderItems } = useInvoiceEditorActions();

  const invalidItemIds = useMemo(
    () => new Set(invalidItems.map((inv) => inv.item.id)),
    [invalidItems]
  );

  const validItems = useMemo(
    () => items.filter((item) => !invalidItemIds.has(item.id)),
    [items, invalidItemIds]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = validItems.findIndex((item) => item.id === active.id);
        const newIndex = validItems.findIndex((item) => item.id === over.id);
        reorderItems(oldIndex, newIndex);
      }
    },
    [validItems, reorderItems]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Items / Services <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Add items or services to include in the invoice.
            </CardDescription>
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addCustomItem}>
              <Plus className="mr-1 h-4 w-4" />
              Custom Item
            </Button>

            <Button size="sm" onClick={addItem}>
              <Plus className="mr-1 h-4 w-4" />
              From List
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Invalid Items Alert */}
        <ItemSectionInvalidItems />

        {/* Valid Items */}
        {validItems.length === 0 ? (
          <ItemsEmptyState />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={validItems}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {/* Desktop Header */}
                {!isMobile && (
                  <div className="text-muted-foreground hidden items-center gap-2 px-3 py-2 text-sm font-medium md:flex">
                    <div className="w-6" />
                    <div className="flex-1">Product</div>
                    <div className="w-24 text-right">Price</div>
                    <div className="w-20 text-right">Qty</div>
                    <div className="w-24 text-right">Total</div>
                    <div className="w-20" />
                  </div>
                )}

                {validItems.map((item) => (
                  <SortableItem key={item.id} item={item} isMobile={isMobile} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
