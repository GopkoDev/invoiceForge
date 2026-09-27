'use client';

import { useRef, useState } from 'react';
import { useModal } from '@/store/use-modal-store';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { AlertCircle, Download, Trash2 } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  deleteUserAccount,
  getAccountDeletionSummary,
} from '@/lib/actions/account-actions';
import { authRoutes } from '@/config/routes.config';

const EXPORT_FAILED_MESSAGE = "Your data couldn't be exported. Try again.";

// SCR-08 states that decide the dialog's body and whether Confirm is enabled.
type DeletionSummary =
  | { status: 'counting' }
  | { status: 'ready'; invoiceCount: number }
  | { status: 'failed' };

interface DialogState {
  summary: DeletionSummary;
  exporting: boolean;
}

function invoiceCountLine(count: number) {
  return count === 1
    ? '1 invoice will be permanently lost.'
    : `${count} invoices will be permanently lost.`;
}

/** Downloads the Freelancer's data export. Returns false when the export failed. */
async function downloadDataExport(): Promise<boolean> {
  try {
    const response = await fetch('/api/user/export');

    if (!response.ok) {
      throw new Error('Failed to export data');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoice-forge-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Error exporting data:', error);
    return false;
  }
}

export function GdprSettings() {
  const [isExporting, setIsExporting] = useState(false);
  const confirmationModal = useModal('confirmationModal');
  // The dialog props live in the modal store, so every SCR-08 transition republishes them.
  // A summary that resolves after Cancel must not reopen the dialog.
  const dialogOpenRef = useRef(false);
  const dialogStateRef = useRef<DialogState>({
    summary: { status: 'counting' },
    exporting: false,
  });

  const handleExportData = async () => {
    setIsExporting(true);
    const exported = await downloadDataExport();
    if (exported) {
      toast.success('Your data has been exported successfully');
    } else {
      toast.error(EXPORT_FAILED_MESSAGE);
    }
    setIsExporting(false);
  };

  const closeDialog = () => {
    dialogOpenRef.current = false;
    confirmationModal.close();
  };

  const showDialog = (next: DialogState) => {
    if (!dialogOpenRef.current) return;
    dialogStateRef.current = next;
    const { summary, exporting } = next;

    confirmationModal.open({
      open: true,
      onClose: closeDialog,
      onConfirm: handleDeleteAccount,
      title: 'Delete your account?',
      description: "This can't be undone.",
      body: (
        <div className="space-y-3">
          {summary.status === 'counting' && <Skeleton className="h-5 w-3/4" />}
          {summary.status === 'ready' && summary.invoiceCount > 0 && (
            <p className="text-sm font-medium">
              {invoiceCountLine(summary.invoiceCount)}
            </p>
          )}
          {summary.status === 'failed' && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle className="flex items-center justify-between gap-2">
                Couldn&apos;t count your invoices.
                <Button size="sm" variant="outline" onClick={loadSummary}>
                  Retry
                </Button>
              </AlertTitle>
            </Alert>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportFromDialog}
            disabled={exporting}
          >
            {exporting ? <Spinner /> : <Download />}
            Export my data first
          </Button>
        </div>
      ),
      variant: 'destructive',
      confirmText: 'Yes, Delete My Account',
      cancelText: 'Cancel',
      // Deleting without seeing what is lost is not allowed: Confirm waits for a count.
      confirmDisabled: summary.status !== 'ready',
    });
  };

  async function loadSummary() {
    showDialog({ ...dialogStateRef.current, summary: { status: 'counting' } });
    const result = await getAccountDeletionSummary();
    showDialog({
      ...dialogStateRef.current,
      summary: result.success
        ? { status: 'ready', invoiceCount: result.data.invoiceCount }
        : { status: 'failed' },
    });
  }

  async function handleExportFromDialog() {
    showDialog({ ...dialogStateRef.current, exporting: true });
    const exported = await downloadDataExport();
    if (!exported) {
      toast.error(EXPORT_FAILED_MESSAGE);
    }
    showDialog({ ...dialogStateRef.current, exporting: false });
  }

  async function handleDeleteAccount() {
    const result = await deleteUserAccount();

    if (!result.success) {
      closeDialog();
      toast.error(result.error);
      return;
    }

    await signOut({ callbackUrl: authRoutes.signIn, redirect: true });
  }

  const openDeleteDialog = () => {
    dialogOpenRef.current = true;
    void loadSummary();
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
          <Button variant="destructive" onClick={openDeleteDialog}>
            <Trash2 />
            Delete Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
