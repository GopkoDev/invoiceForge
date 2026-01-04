import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function SenderProfileFormLoading() {
  return (
    <div className="space-y-6">
      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Main details about your company or individual profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Name field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-16" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Legal Name field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Tax ID field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-36" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Invoice Prefix field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-28" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-[13px] w-64" />
          </div>

          {/* Is Default checkbox */}
          <div className="flex items-center space-x-2 pt-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-[14px] w-48" />
          </div>
        </CardContent>
      </Card>

      {/* Contact Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>How customers can reach you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Email field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Phone field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Website field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-16" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Address Card */}
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Your business location</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Street Address field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-28" />
            <Skeleton className="h-[76px] w-full rounded-md" />
          </div>

          {/* City field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-8" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Postal Code field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-20" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Country field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-16" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Branding Card */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Customize your invoice appearance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Logo URL field */}
          <div className="space-y-2">
            <Skeleton className="h-[14px] w-16" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-[13px] w-96 max-w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-4">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
