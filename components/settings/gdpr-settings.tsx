'use client';

import { useState } from 'react';
import { useModal } from '@/store/use-modal-store';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { deleteUserAccount } from '@/lib/actions/account-actions';
import { authRoutes } from '@/config/routes.config';

export function GdprSettings() {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmationModal = useModal('confirmationModal');

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/user/export');

      if (!response.ok) {
        throw new Error('Failed to export data');
      }

      // Create a blob from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'invoice-forge-data.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Your data has been exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteUserAccount();

      if (!result.success) {
        toast.error(result.error || 'Failed to delete account');
        setIsDeleting(false);
        return;
      }

      toast.success('Account deleted successfully');

      await signOut({ callbackUrl: authRoutes.signIn, redirect: true });
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Portability */}
      <Card>
        <CardHeader>
          <CardTitle>Export My Data</CardTitle>
          <CardDescription>
            Download all your data in JSON format. This includes your profile,
            invoices, customers, products, and sender profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleExportData}
            disabled={isExporting}
            variant="outline"
          >
            {isExporting ? (
              <>
                <Spinner className="mr-2" />
                Exporting...
              </>
            ) : (
              <>
                <Download />
                Export My Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Account Deletion */}
      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={() =>
              confirmationModal.open({
                open: true,
                onClose: confirmationModal.close,
                onConfirm: handleDeleteAccount,
                title: 'Are you absolutely sure?',
                description:
                  'This action cannot be undone. All your invoices, customers, and profile data will be permanently deleted from our active servers',
                variant: 'destructive',
                confirmText: 'Yes, Delete My Account',
                cancelText: 'Cancel',
              })
            }
          >
            {isDeleting ? (
              <>
                <Spinner className="mr-2" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 />
                Delete Account
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
