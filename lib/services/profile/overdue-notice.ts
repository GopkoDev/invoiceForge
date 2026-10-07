import 'server-only';
import { prisma } from '@/prisma';
import { ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';

/** AC-24 notice: true while `User.overdueNoticeDismissedAt` is still NULL. */
export async function getOverdueNoticeState(
  actor: ActingFreelancer
): Promise<ActionResult<{ showOverdueRuleNotice: boolean }>> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { overdueNoticeDismissedAt: true },
    });
    return ok({ showOverdueRuleNotice: user?.overdueNoticeDismissedAt == null });
  } catch (error) {
    return failed('Error reading overdue notice state:', error, 'Something went wrong. Please try again.');
  }
}

/** Idempotent: writes only while still NULL, so the first dismissal time is kept and repeats return ok. */
export async function dismissOverdueNotice(actor: ActingFreelancer): Promise<ActionResult<void>> {
  try {
    await prisma.user.updateMany({
      where: { id: actor.userId, overdueNoticeDismissedAt: null },
      data: { overdueNoticeDismissedAt: new Date() },
    });
    return ok();
  } catch (error) {
    return failed('Error dismissing overdue notice:', error, 'Something went wrong. Please try again.');
  }
}
