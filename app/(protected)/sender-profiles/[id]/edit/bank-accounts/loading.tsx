import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function BankAccountsEditLoading() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Bank Accounts</CardTitle>
            <CardDescription>
              Manage bank accounts for this sender profile
            </CardDescription>
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Bank Account Card 1 */}
          {[1, 2].map((index) => (
            <Card key={`bank-account-skeleton-${index}`}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />

                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-48" />
                  </div>

                  <Skeleton className="h-6 w-16 rounded-full" />

                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 w-9" />
                  </div>
                </div>
              </CardHeader>

              <Separator />

              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Account Number */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </div>

                  {/* IBAN */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-52" />
                    </div>
                  </div>

                  {/* SWIFT/BIC */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>

                  {/* Currency & Usage */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
