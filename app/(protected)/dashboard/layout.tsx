import { DashboardShell } from '@/components/dashboard';
import { DashboardModalContainer } from '@/components/modals/dashboard/dashboard-modal-container';

export default function DashboardPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell>
      {children}

      <DashboardModalContainer />
    </DashboardShell>
  );
}
