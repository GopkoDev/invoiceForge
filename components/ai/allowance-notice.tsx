import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { protectedRoutes } from '@/config/routes.config';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

// "at 00:00" at a local midnight, "tomorrow at HH:mm" on a later local day, else "at HH:mm".
function renewalWhen(renewsAt: string, timeZone: string, now: Date): string {
  const renew = zoneParts(new Date(renewsAt), timeZone);
  if (renew.time === '00:00') return 'at 00:00';
  const today = zoneParts(now, timeZone);
  return renew.day > today.day ? `tomorrow at ${renew.time}` : `at ${renew.time}`;
}

// Isolated so the render stays readable; the notice only needs minute precision.
function currentTime(): Date {
  return new Date();
}

export function AllowanceNotice({
  state,
  usedUpMessage,
  handMadeLink = false,
  now,
}: {
  state: AllowanceState;
  usedUpMessage?: string;
  handMadeLink?: boolean;
  /** Test seam; defaults to the current time. */
  now?: Date;
}) {
  if (state.left > 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {`${state.left} of ${state.limit} messages left today`}
      </p>
    );
  }

  const when = renewalWhen(state.renewsAt, state.timeZone, now ?? currentTime());
  return (
    <div className="flex flex-col gap-3" role="status">
      {usedUpMessage ? (
        <p className="font-medium">{usedUpMessage}</p>
      ) : (
        <>
          <p className="font-medium">{`You've used today's ${state.limit} messages`}</p>
          <p className="text-sm text-muted-foreground">{`They renew ${when} your time.`}</p>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        An AI client connected with a Personal key isn&apos;t affected, and your conversations stay
        readable.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={protectedRoutes.settingsAssistants}
          className={buttonVariants({ variant: 'outline' })}
        >
          Connect your own AI client →
        </Link>
        {handMadeLink ? (
          <Link href={protectedRoutes.invoicesNew} className={buttonVariants({ variant: 'outline' })}>
            Create it by hand →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
