import { ContentAreaHeaderLoading } from '@/components/layout/content-area';
import { PAGE_HEADER_TEXT } from './_constants';
import { ProductFormLoading } from '@/components/products';
import { Skeleton } from '@/components/ui/skeleton';

const { title, description } = PAGE_HEADER_TEXT;

export default function NewProductLoading() {
  return (
    <>
      <ContentAreaHeaderLoading
        titleText={title}
        descriptionText={description}
      />

      {/* Match the informational Alert shown on the New Product form */}
      <div className="grid gap-0.5 rounded-lg border px-4 py-3 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*='size-'])]:size-4 w-full relative">
        <Skeleton className="h-4 w-4 rounded-sm" />
        <Skeleton className="h-5 w-72" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full max-w-[760px]" />
          <Skeleton className="h-5 w-[88%] max-w-[680px]" />
          <Skeleton className="h-5 w-[62%] max-w-[520px]" />
        </div>
      </div>

      <ProductFormLoading />
    </>
  );
}
