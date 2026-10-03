// ADR-0008: one list of settings every deploy environment must carry. No `server-only`
// import so scripts/check-required-settings.ts can use it.
export const REQUIRED_SETTINGS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'EMAIL_SERVER_HOST',
  'EMAIL_SERVER_PORT',
  'EMAIL_SERVER_USER',
  'EMAIL_SERVER_PASSWORD',
  'NEXT_PUBLIC_SENTRY_DSN',
  'CRON_SECRET',
  'LIMIT_KEY_SECRET',
] as const;

export type RequiredSetting = (typeof REQUIRED_SETTINGS)[number];

// Settings with a safe default: documented in env.example, never fail the build when unset.
export const OPTIONAL_SETTINGS = [
  // Sign-in response floor F in ms (sad.md §6): the p90 send time measured on preview,
  // default 1000, clamped to at most 1200.
  'SIGNIN_RESPONSE_FLOOR_MS',
] as const;

export function missingSettings(
  env: Record<string, string | undefined> = process.env
): RequiredSetting[] {
  return REQUIRED_SETTINGS.filter((name) => !env[name]);
}

export function requireSetting(name: RequiredSetting): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required setting: ${name}`);
  return value;
}
