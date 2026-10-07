import { DashboardSetupAlert } from '@/components/dashboard/dashboard-setup-alert';
import { OverdueRuleNotice } from '@/components/dashboard/overdue-rule-notice';
import { ConnectAiEntry } from '@/components/dashboard/connect-ai-entry';
import type { SetupCheckResult } from '@/lib/services/profile/setup-check';

interface DashboardBannersProps {
  setupStatus: SetupCheckResult;
  showOverdueRuleNotice: boolean;
  showConnectAiEntry: boolean;
}

/** SCR-01 order below the header: setup alert, overdue-rule notice, Connect your AI entry point. */
export function DashboardBanners({
  setupStatus,
  showOverdueRuleNotice,
  showConnectAiEntry,
}: DashboardBannersProps) {
  return (
    <>
      <DashboardSetupAlert setupStatus={setupStatus} />
      {showOverdueRuleNotice && <OverdueRuleNotice />}
      {showConnectAiEntry && <ConnectAiEntry />}
    </>
  );
}
