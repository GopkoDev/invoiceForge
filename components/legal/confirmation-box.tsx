import React from 'react';
import { Check } from 'lucide-react';

interface ConfirmationBoxProps {
  title: string;
  items: string[];
  lastUpdated: string;
  compliance: string;
}

export function ConfirmationBox({
  title,
  items,
  lastUpdated,
  compliance,
}: ConfirmationBoxProps) {
  return (
    <div className="bg-primary/5 rounded-2xl p-8 text-center">
      <p className="mb-4 text-lg font-semibold">{title}</p>
      <div className="mx-auto max-w-md space-y-2">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <Check className="text-primary h-5 w-5" />
            <span className="text-muted-foreground">{item}</span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        <em>{lastUpdated}</em>
      </p>
      <p className="text-muted-foreground mt-2 text-xs">{compliance}</p>
    </div>
  );
}
