import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function CustomerFormLoading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Main details about your customer or client
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Name */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-3 w-48" />
          </div>

          {/* Company Name */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Tax ID */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Default Currency */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-3 w-52" />
          </div>
        </CardContent>
      </Card>

      {/* Contact Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>How to reach this customer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Phone */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Website */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Branding Card */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Logo or profile image</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-3 w-64" />
          </div>
        </CardContent>
      </Card>

      {/* Address Card */}
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Customer billing address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Street Address */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[76px] w-full" />
          </div>

          {/* City */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Postal Code */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Country */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Additional Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
          <CardDescription>Notes and other details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-3 w-72" />
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-4">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-36" />
      </div>
    </div>
  );
}
