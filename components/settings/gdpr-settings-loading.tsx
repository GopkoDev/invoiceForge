import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function GdprSettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Data Export Card */}
      <Card>
        <CardHeader>
          <CardTitle>Export My Data</CardTitle>
          <CardDescription>
            Download all your data in JSON format. This includes your profile,
            invoices, customers, products, and sender profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-36" />
        </CardContent>
      </Card>

      {/* Account Deletion Card */}
      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-36" />
        </CardContent>
      </Card>
    </div>
  );
}
