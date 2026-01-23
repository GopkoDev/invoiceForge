import React from 'react';
import { cn } from '@/lib/utils';
import { parseHtmlText } from '@/lib/utils/parse-html-text';

interface DataTableProps {
  headers: string[];
  rows: Record<string, unknown>[];
  className?: string;
}

export function DataTable({ headers, rows, className }: DataTableProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            {headers.map((header) => (
              <th key={header} className="p-2 text-left font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted-foreground text-sm">
          {rows.map((row, index) => (
            <tr key={index} className="border-b">
              {Object.values(row).map((value, cellIndex) => {
                const isBold = row.bold || false;
                return (
                  <td
                    key={cellIndex}
                    className={cn('p-2', isBold && 'font-semibold')}
                  >
                    {parseHtmlText(String(value))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
