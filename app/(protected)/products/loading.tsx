import { ContentAreaHeaderLoading } from '@/components/layout/content-area';
import { PAGE_HEADER_TEXT } from './_constants';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const { title, description, buttonText } = PAGE_HEADER_TEXT;

function ProductsTableLoading() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Product</TableHead>
            <TableHead className="text-right w-[140px]">Price</TableHead>
            <TableHead className="text-center w-[160px]">Unit</TableHead>
            <TableHead className="text-center w-[100px]">Status</TableHead>
            <TableHead className="text-center w-[100px]">Invoices</TableHead>
            <TableHead className="text-center w-[130px]">
              Custom Prices
            </TableHead>
            <TableHead className="w-[70px]" aria-label="Actions"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((index) => (
            <TableRow key={`product-skeleton-${index}`}>
              {/* Product */}
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              </TableCell>
              {/* Price */}
              <TableCell className="text-right">
                <Skeleton className="h-4 w-20 ml-auto" />
              </TableCell>
              {/* Unit */}
              <TableCell className="text-center">
                <Skeleton className="h-4 w-20 mx-auto" />
              </TableCell>
              {/* Status */}
              <TableCell className="text-center">
                <Skeleton className="h-5 w-14 mx-auto rounded-full" />
              </TableCell>
              {/* Invoices */}
              <TableCell className="text-center text-muted-foreground">
                <Skeleton className="h-4 w-3 mx-auto" />
              </TableCell>
              {/* Custom Prices */}
              <TableCell className="text-center text-muted-foreground">
                <Skeleton className="h-4 w-3 mx-auto" />
              </TableCell>
              {/* Actions */}
              <TableCell>
                <Skeleton className="h-8 w-8 rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ProductsLoading() {
  return (
    <>
      <ContentAreaHeaderLoading
        titleText={title}
        descriptionText={description}
        buttonText={buttonText}
      />

      <ProductsTableLoading />
    </>
  );
}
