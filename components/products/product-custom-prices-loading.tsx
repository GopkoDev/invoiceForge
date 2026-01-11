import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ProductCustomPricesTableLoading() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="w-[280px]">Customer</TableHead>
            <TableHead className="w-[140px]">Label</TableHead>
            <TableHead className="w-[140px] text-right">
              Default Price
            </TableHead>
            <TableHead className="w-[180px] text-right">Custom Price</TableHead>
            <TableHead className="w-[220px]">Notes</TableHead>
            <TableHead className="w-[80px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((index) => (
            <TableRow key={`custom-price-skeleton-${index}`}>
              {/* Customer */}
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 shrink-0 rounded" />
                  <div className="flex flex-col space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </TableCell>
              {/* Label */}
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              {/* Default Price */}
              <TableCell className="text-muted-foreground text-right">
                <Skeleton className="ml-auto h-4 w-24" />
              </TableCell>
              {/* Custom Price */}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              </TableCell>
              {/* Notes */}
              <TableCell className="max-w-xs">
                <Skeleton className="h-4 w-40" />
              </TableCell>
              {/* Actions */}
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-9 w-9 rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
