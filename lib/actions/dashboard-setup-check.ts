'use server';

import { ActionResult } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { checkSetup, type SetupCheckResult as ServiceSetupCheckResult } from '@/lib/services/profile/setup-check';

// A type alias, not `export type { … }`: Next's 'use server' transform treats a re-export as an action export and the build fails.
export type SetupCheckResult = ServiceSetupCheckResult;

export async function checkDashboardSetup(): Promise<
  ActionResult<SetupCheckResult>
> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return checkSetup(actor.data);
}
