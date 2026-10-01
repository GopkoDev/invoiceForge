'use server';

import { ActionResult } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { checkSetup, type SetupCheckResult } from '@/lib/services/profile/setup-check';

export type { SetupCheckResult };

export async function checkDashboardSetup(): Promise<
  ActionResult<SetupCheckResult>
> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return checkSetup(actor.data);
}
