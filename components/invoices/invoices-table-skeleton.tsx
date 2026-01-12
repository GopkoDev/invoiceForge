import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function SortHeaderSkeleton({ widthClass }: { widthClass: string }) {
  return (
    <div className="-ml-3 flex h-8 items-center gap-1">
      <Skeleton className={`h-4 ${widthClass} rounded-sm`} />
      <Skeleton className="size-3.5 rounded-sm" />
    </div>
  );
}

function TextHeaderSkeleton({ widthClass }: { widthClass: string }) {
  return <Skeleton className={`h-4 ${widthClass} rounded-sm`} />;
}

export function InvoicesTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Tabs Skeleton */}
      <div className="bg-muted inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
        <Skeleton className="h-[calc(100%-1px)] w-14 rounded-md" />
        <Skeleton className="h-[calc(100%-1px)] w-14 rounded-md" />
        <Skeleton className="h-[calc(100%-1px)] w-14 rounded-md" />
      </div>

      {/* Filters Skeleton */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm min-w-64 flex-1">
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-64" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>
                <SortHeaderSkeleton widthClass="w-14" />
              </TableHead>
              <TableHead>
                <TextHeaderSkeleton widthClass="w-20" />
              </TableHead>
              <TableHead>
                <TextHeaderSkeleton widthClass="w-16" />
              </TableHead>
              <TableHead>
                <TextHeaderSkeleton widthClass="w-14" />
              </TableHead>
              <TableHead>
                <SortHeaderSkeleton widthClass="w-16" />
              </TableHead>
              <TableHead>
                <SortHeaderSkeleton widthClass="w-16" />
              </TableHead>
              <TableHead>
                <div className="text-right">
                  <SortHeaderSkeleton widthClass="w-12" />
                </div>
              </TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <div className="max-w-32">
                    <Skeleton className="h-4 w-28" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-32">
                    <Skeleton className="h-4 w-24" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-14 rounded-4xl" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <div className="text-right font-medium">
                    <Skeleton className="ml-auto h-4 w-20" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="size-8 rounded-[min(var(--radius-md),10px)]" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Skeleton */}
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <Skeleton className="h-4 w-56" />
        </div>

        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>

        <div className="flex items-center justify-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}
