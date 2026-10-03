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
import {
  goToSignIn,
  redirectIfUnauthorized,
} from '@/lib/helpers/client-session-redirect';

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
  // F-26: an export rate-limited from the dialog shows its D-S3 Alert in the dialog body — the
  // page-level Alert sits behind the modal where the Freelancer can't see it.
  rateLimitMessage: string | null;
}

function invoiceCountLine(count: number) {
  return count === 1
    ? '1 invoice will be permanently lost.'
    : `${count} invoices will be permanently lost.`;
}

type ExportOutcome = 'ok' | 'unauthorized' | 'failed' | { rateLimited: string };

const RATE_LIMIT_FALLBACK_MESSAGE =
  "You've reached the export limit. Try again later.";

function padTime(n: number) {
  return String(n).padStart(2, '0');
}

/** D-S3 alert text: local HH:mm from retryAt, or the server's text when retryAt is unusable. */
async function rateLimitMessageFrom(response: Response): Promise<string> {
  let body: { error?: unknown; details?: { retryAt?: unknown } } | undefined;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const retryAt = body?.details?.retryAt;
  const date = typeof retryAt === 'string' ? new Date(retryAt) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return `You've reached the export limit. You can export again at ${padTime(date.getHours())}:${padTime(date.getMinutes())}.`;
  }
  return typeof body?.error === 'string' && body.error
    ? body.error
    : RATE_LIMIT_FALLBACK_MESSAGE;
}

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

    if (response.status === 429) {
      return { rateLimited: await rateLimitMessageFrom(response) };
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
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const confirmationModal = useModal('confirmationModal');
  // The dialog props live in the modal store, so every SCR-08 transition republishes them.
  // A summary that resolves after Cancel must not reopen the dialog.
  const dialogOpenRef = useRef(false);
  const dialogStateRef = useRef<DialogState>({
    summary: { status: 'counting' },
    exporting: false,
    deleting: false,
    rateLimitMessage: null,
  });

  const handleExportData = async () => {
    setIsExporting(true);
    setRateLimitMessage(null);
    const outcome = await downloadDataExport();
    if (typeof outcome === 'object') {
      setRateLimitMessage(outcome.rateLimited);
      setIsExporting(false);
      return;
    }
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
    const { summary, exporting, deleting, rateLimitMessage } = next;

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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadSummary}
                  disabled={deleting}
                >
                  Retry
                </Button>
              </AlertTitle>
            </Alert>
          )}
          {rateLimitMessage && (
            <Alert>
              <AlertCircle />
              <AlertTitle>{rateLimitMessage}</AlertTitle>
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
    try {
      const result = await getAccountDeletionSummary();
      // AC-21: a stale session goes to sign-in, not to the count-failed Alert.
      if (redirectIfUnauthorized(result)) return;
      showDialog({
        ...dialogStateRef.current,
        summary: result.success
          ? { status: 'ready', invoiceCount: result.data.invoiceCount }
          : { status: 'failed' },
      });
    } catch (error) {
      // A rejected call is the proxy's 401 as a client sees it (contract "Boundary"): sign-in.
      console.error('Error counting invoices for account deletion:', error);
      goToSignIn();
    }
  }

  async function handleExportFromDialog() {
    showDialog({
      ...dialogStateRef.current,
      exporting: true,
      rateLimitMessage: null,
    });
    const outcome = await downloadDataExport();
    const rateLimitMessage =
      typeof outcome === 'object' ? outcome.rateLimited : null;
    if (outcome === 'unauthorized') {
      // AC-21: a stale session must go to sign-in, not a generic "couldn't be exported" toast.
      goToSignIn();
      return;
    } else if (outcome === 'failed') {
      toast.error(EXPORT_FAILED_MESSAGE);
    }
    showDialog({
      ...dialogStateRef.current,
      exporting: false,
      rateLimitMessage,
    });
  }

  async function handleDeleteAccount() {
    // F-45: screens.md SCR-08 "deleting" — every button is disabled while the delete is in
    // flight, including the body's Export/Retry buttons ConfirmationModal's own pending-disable
    // (Confirm/Cancel only) never reaches.
    showDialog({ ...dialogStateRef.current, deleting: true });
    let result: Awaited<ReturnType<typeof deleteUserAccount>>;
    try {
      result = await deleteUserAccount();
    } catch (error) {
      // A rejected call is the proxy's 401 as a client sees it (contract "Boundary"): sign-in.
      console.error('Error deleting account:', error);
      goToSignIn();
      return;
    }

    // AC-21: a stale session goes to sign-in, not a "Not signed in." toast.
    if (redirectIfUnauthorized(result)) return;

    if (!result.success) {
      closeDialog();
      toast.error(result.error);
      return;
    }

    try {
      await signOut({ callbackUrl: authRoutes.signIn, redirect: true });
    } catch (error) {
      // The account is already gone (AC-20), so never claim "Nothing was removed"; the
      // cookie-clearing route finishes the sign-out.
      console.error('Error signing out after account deletion:', error);
      goToSignIn();
    }
  }

  const openDeleteDialog = () => {
    dialogOpenRef.current = true;
    // N-12: a previous attempt's `deleting`/`exporting` flags (and its rate-limit Alert) must
    // not carry into a reopened dialog.
    dialogStateRef.current = {
      summary: { status: 'counting' },
      exporting: false,
      deleting: false,
      rateLimitMessage: null,
    };
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
        <CardContent className="space-y-3">
          {rateLimitMessage && (
            <Alert>
              <AlertCircle />
              <AlertTitle>{rateLimitMessage}</AlertTitle>
            </Alert>
          )}
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
