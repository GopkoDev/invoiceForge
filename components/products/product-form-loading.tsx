import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function ProductFormLoading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Product Information</CardTitle>
          <CardDescription>
            Basic details about your product or service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Product Name */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[14px] w-40" />
            <Skeleton className="h-9 w-full rounded-md" />
            {/* FieldDescription uses text-sm leading-normal (taller than 14px) */}
            <Skeleton className="h-5 w-72" />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[14px] w-28" />
            <Skeleton className="h-[84px] w-full rounded-md" />
            <Skeleton className="h-5 w-80" />
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Skeleton className="h-[14px] w-36" />
              <Skeleton className="h-5 w-[420px] max-w-full" />
            </div>
            <Skeleton className="h-[18.4px] w-[32px] rounded-full" />
          </div>
        </CardContent>
      </Card>

      {/* Pricing Card */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>Set the default price and unit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Price */}
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[14px] w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-5 w-48" />
            </div>

            {/* Currency */}
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[14px] w-24" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>

          {/* Unit */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[14px] w-44" />
            <Skeleton className="h-9 w-full rounded-md" />
            {/* This description often wraps to two lines depending on width */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-full max-w-full" />
              <Skeleton className="h-5 w-[72%]" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-4">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
    </div>
  );
}
