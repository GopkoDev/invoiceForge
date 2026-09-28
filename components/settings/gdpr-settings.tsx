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
import { goToSignIn } from '@/lib/helpers/client-session-redirect';

const EXPORT_FAILED_MESSAGE = "Your data couldn't be exported. Try again.";
const FALLBACK_EXPORT_FILENAME = 'invoice-forge-data.json';

/** Reads the file name the server chose (Content-Disposition), falling back when absent. */
function exportFilenameFrom(response: Response): string {
  const disposition = response.headers.get('content-disposition');
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? FALLBACK_EXPORT_FILENAME;
}

// SCR-08 states that decide the dialog's body and whether Confirm is enabled.
type DeletionSummary =
  | { status: 'counting' }
  | { status: 'ready'; invoiceCount: number }
  | { status: 'failed' };

interface DialogState {
  summary: DeletionSummary;
  exporting: boolean;
  // F-45: screens.md SCR-08 "deleting" row — every button in the dialog is disabled while the
  // confirmed delete is in flight, not just ConfirmationModal's own Confirm/Cancel footer.
  deleting: boolean;
}

function invoiceCountLine(count: number) {
  return count === 1
    ? '1 invoice will be permanently lost.'
    : `${count} invoices will be permanently lost.`;
}

type ExportOutcome = 'ok' | 'unauthorized' | 'failed';

/**
 * Downloads the Freelancer's data export. A 401 (AC-21: a stale session must be treated as a
 * Visitor) is reported separately from any other failure, since the caller sends the device to
 * sign-in rather than showing the generic export-failed toast.
 */
async function downloadDataExport(): Promise<ExportOutcome> {
  try {
    const response = await fetch('/api/user/export');

    if (response.status === 401) {
      return 'unauthorized';
    }

    if (!response.ok) {
      throw new Error('Failed to export data');
    }

    const filename = exportFilenameFrom(response);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return 'ok';
  } catch (error) {
    console.error('Error exporting data:', error);
    return 'failed';
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
    deleting: false,
  });

  const handleExportData = async () => {
    setIsExporting(true);
    const outcome = await downloadDataExport();
    if (outcome === 'unauthorized') {
      // AC-21: a stale session must go to sign-in, not a generic "couldn't be exported" toast.
      goToSignIn();
      return;
    }
    if (outcome === 'ok') {
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
    const { summary, exporting, deleting } = next;

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
                <Button size="sm" variant="outline" onClick={loadSummary} disabled={deleting}>
                  Retry
                </Button>
              </AlertTitle>
            </Alert>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportFromDialog}
            disabled={exporting || deleting}
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
    // F-36: a rejected call must still resolve out of "counting" into the SCR-08 failed state
    // (with its Retry), rather than leaving the skeleton up forever.
    try {
      const result = await getAccountDeletionSummary();
      showDialog({
        ...dialogStateRef.current,
        summary: result.success
          ? { status: 'ready', invoiceCount: result.data.invoiceCount }
          : { status: 'failed' },
      });
    } catch (error) {
      console.error('Error counting invoices for account deletion:', error);
      showDialog({ ...dialogStateRef.current, summary: { status: 'failed' } });
    }
  }

  async function handleExportFromDialog() {
    showDialog({ ...dialogStateRef.current, exporting: true });
    const outcome = await downloadDataExport();
    if (outcome === 'unauthorized') {
      // AC-21: a stale session must go to sign-in, not a generic "couldn't be exported" toast.
      goToSignIn();
      return;
    }
    if (outcome === 'failed') {
      toast.error(EXPORT_FAILED_MESSAGE);
    }
    showDialog({ ...dialogStateRef.current, exporting: false });
  }

  async function handleDeleteAccount() {
    // F-45: screens.md SCR-08 "deleting" — every button is disabled while the delete is in
    // flight, including the body's Export/Retry buttons ConfirmationModal's own pending-disable
    // (Confirm/Cancel only) never reaches.
    showDialog({ ...dialogStateRef.current, deleting: true });
    // F-36: a rejected call (network failure, thrown before the server ever returns an
    // ActionResult) must land on the same toast + close as a FAILED result, not leave Confirm
    // with no feedback at all.
    try {
      const result = await deleteUserAccount();

      if (!result.success) {
        closeDialog();
        toast.error(result.error);
        return;
      }

      await signOut({ callbackUrl: authRoutes.signIn, redirect: true });
    } catch (error) {
      console.error('Error deleting account:', error);
      closeDialog();
      toast.error("Your account couldn't be deleted. Nothing was removed.");
    }
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
