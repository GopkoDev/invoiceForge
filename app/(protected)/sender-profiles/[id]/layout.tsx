import { ContentAreaHeader } from '@/components/layout/content-area/content-area';

export default function SenderProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ContentAreaHeader
        title="Edit Sender Profile"
        description="Update your company or business profile information and manage bank accounts"
      />

      <div>{children}</div>
    </>
  );
}
