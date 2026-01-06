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
        <TableHeader>
          <TableRow>
            <TableHead className="w-[280px]">Customer</TableHead>
            <TableHead className="w-[140px]">Label</TableHead>
            <TableHead className="text-right w-[140px]">
              Default Price
            </TableHead>
            <TableHead className="text-right w-[180px]">Custom Price</TableHead>
            <TableHead className="w-[220px]">Notes</TableHead>
            <TableHead className="text-right w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((index) => (
            <TableRow key={index}>
              {/* Customer */}
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded shrink-0" />
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
              <TableCell className="text-right text-muted-foreground">
                <Skeleton className="h-4 w-24 ml-auto" />
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
                <Skeleton className="h-9 w-9 rounded-md ml-auto" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
