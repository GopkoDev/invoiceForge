import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function ProfileSettingsLoading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your profile information and how others see you on the
            platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Form with space-y-6 */}
          <div className="space-y-6">
            {/* Avatar Section - flex items-center gap-6 */}
            <div className="flex items-center gap-6">
              <Skeleton className="h-20 w-20 rounded-full shrink-0" />

              {/* Field flex-1 - matches Field component with gap-3 */}
              <div className="flex-1 flex flex-col gap-3">
                {/* FieldLabel - text-sm leading-snug ≈ h-5 */}
                <Skeleton className="h-5 w-20" />

                {/* Input - h-9 */}
                <Skeleton className="h-9 w-full" />

                {/* FieldError is not rendered when no errors, so no skeleton */}

                {/* Description paragraph - text-xs with default line-height */}
                <Skeleton className="h-4 w-56 mt-1" />
              </div>
            </div>

            {/* FieldGroup with gap-7 */}
            <div className="flex flex-col gap-7">
              {/* Name Field - matches Field component with gap-3 */}
              <div className="flex flex-col gap-3">
                {/* FieldLabel - text-sm leading-snug ≈ h-5 */}
                <Skeleton className="h-5 w-20" />

                {/* Input - h-9 */}
                <Skeleton className="h-9 w-full" />

                {/* FieldError is not rendered when no errors */}
              </div>

              {/* Email Field - matches Field component with gap-3 */}
              <div className="flex flex-col gap-3">
                {/* FieldLabel - text-sm leading-snug ≈ h-5 */}
                <Skeleton className="h-5 w-12" />

                {/* Input - h-9 */}
                <Skeleton className="h-9 w-full" />

                {/* FieldError is not rendered when no errors */}
                {/* Warning message would be here if email changed, but not in loading state */}
              </div>
            </div>

            {/* Save Button - flex justify-end */}
            <div className="flex justify-end">
              {/* Button default size h-9 with "Save Changes" text */}
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
