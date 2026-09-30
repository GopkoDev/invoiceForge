import { InvoiceEditorModalContainer } from '@/components/modals/invoice-editor/invoice-editor-modal-container';
import { requireLiveUser } from '@/lib/helpers/route-auth';

export default async function InvoiceEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // T09 (ADR-0002, AC-21): a stale token whose User row is gone is treated as a Visitor —
  // redirected to sign-in before any protected data renders.
  await requireLiveUser();

  return (
    <>
      <div className="bg-background min-h-screen">{children}</div>
      <InvoiceEditorModalContainer />
    </>
  );
}
