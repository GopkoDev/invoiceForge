import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ListItem {
  text: string;
  icon?: 'check' | 'x';
}

interface ListWithIconsProps {
  items: string[] | ListItem[];
  variant?: 'check' | 'x' | 'none';
  className?: string;
}

export function ListWithIcons({
  items,
  variant = 'check',
  className,
}: ListWithIconsProps) {
  return (
    <ul className={cn('space-y-2', className)}>
      {items.map((item, index) => {
        const text = typeof item === 'string' ? item : item.text;
        const itemIcon = typeof item === 'object' ? item.icon : variant;
        const Icon = itemIcon === 'check' ? Check : itemIcon === 'x' ? X : null;

        return (
          <li key={index} className="flex items-start gap-2">
            {Icon && (
              <Icon
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  itemIcon === 'check' && 'text-primary',
                  itemIcon === 'x' && 'text-muted-foreground'
                )}
              />
            )}
            <span className="text-muted-foreground">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
