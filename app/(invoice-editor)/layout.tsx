import { InvoiceEditorModalContainer } from '@/components/modals/invoice-editor/invoice-editor-modal-container';

export default function InvoiceEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="bg-background min-h-screen">{children}</div>
      <InvoiceEditorModalContainer />
    </>
  );
}
