// AC-10 (ai-assistant; spec §8 time-zone rule, ADR-0009): when the Daily message allowance renews, in the
// Freelancer's own local time. Shared by the 429 sentence of POST /api/chat and the AllowanceNotice, so
// both say the same thing: "at 00:00" at a local midnight, "tomorrow at HH:mm" on a later local day
// (the 24-hour mark after a time-zone change), else "at HH:mm".
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

export function renewalWhen(renewsAt: string, timeZone: string, now: Date): string {
  const renew = zoneParts(new Date(renewsAt), timeZone);
  if (renew.time === '00:00') return 'at 00:00';
  const today = zoneParts(now, timeZone);
  return renew.day > today.day ? `tomorrow at ${renew.time}` : `at ${renew.time}`;
}
