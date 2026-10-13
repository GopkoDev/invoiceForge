/**
 * ai-chat-v2 T37 (screens.md §SCR-02 «Greeting»): the first line of the AI section's empty state. Pure and isomorphic:
 * the /ai page computes it on the server in the Freelancer time zone, so the client renders the same text.
 */

/** The first word of the account name, or null when there is none. */
export function firstName(name: string | null | undefined): string | null {
  const word = name?.trim().split(/\s+/)[0];
  return word ? word : null;
}

/** The hour (0–23) of `now` in `timeZone`. */
function localHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone,
  }).format(now);
  return Number(hour);
}

/** "Good morning" 05:00–11:59, "Good afternoon" 12:00–17:59, "Good evening" otherwise; then ", {first name}" if any. */
export function greetingLine(
  name: string | null | undefined,
  timeZone: string,
  now: Date
): string {
  const hour = localHour(now, timeZone);
  const part =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 18
        ? 'Good afternoon'
        : 'Good evening';
  const first = firstName(name);
  return first ? `${part}, ${first}` : part;
}
