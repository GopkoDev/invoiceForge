// Prisma error messages embed the rendered call arguments (`email: "..."`), and `errorFormat`
// cannot remove them: 'minimal' still includes them. They are cut before an error leaves the
// process, whether to Sentry (sentry.server.config.ts) or to the application's own server log
// lines (redactError), per sad.md §8 "No request body or bank detail is logged" (review 2026-09-30-2
// S-01, 2026-09-30-3 U-01). Errors Auth.js catches itself go through its default logger unscrubbed,
// a known exception recorded in sad.md §11 (review 2026-09-30-4 V-01).
//
// Outside production Prisma renders the call site into the backticks (`}).user.update()`), so the
// pattern accepts any text there, not only `prisma.*`.
const PRISMA_INVOCATION = /(Invalid `[^`]*` invocation)[\s\S]*/;
export const REDACTED = ' [arguments redacted]';

export function hasPrismaInvocation(text: string): boolean {
  return PRISMA_INVOCATION.test(text);
}

export function scrubPrismaText(text: string): string {
  return text.replace(PRISMA_INVOCATION, `$1${REDACTED}`);
}

// A request or initialization error ends with the engine's reason ("Can't reach database server",
// "Unique constraint failed on the fields: (`email`)"), which is kept for triage (review
// 2026-09-30-3 U-03) — but only for codes whose reason holds no values. The pg adapter builds some
// reasons from the driver message, which can quote the rejected input (P2007 `invalid input syntax
// for type uuid: "<value>"`, P2020, P2023, raw-query P2010), so every other code, and an error
// without one, is cut whole (review 2026-09-30-4 V-02). The kept codes name columns, fields,
// tables, models or the server, never a row value (checked against @prisma/client 7.2 and
// @prisma/adapter-pg).
const VALUE_FREE_REASON_CODES = new Set([
  ...Array.from({ length: 18 }, (_, i) => `P${1000 + i}`), // P1000–P1017
  'P2000',
  'P2002',
  'P2003',
  'P2011',
  'P2021',
  'P2022',
  'P2025',
  'P2034',
  'P2037',
]);

/** scrubPrismaText, keeping the final reason paragraph when the error's code allows it. */
export function scrubPrismaError(
  text: string,
  code: string | undefined
): string {
  const match =
    code && VALUE_FREE_REASON_CODES.has(code)
      ? PRISMA_INVOCATION.exec(text)
      : null;
  if (!match) return scrubPrismaText(text);
  const paragraphs = match[0].split(/\n\s*\n/).map((p) => p.trim());
  const reason = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '';
  if (!reason) return scrubPrismaText(text);
  return `${text.slice(0, match.index)}${match[1]}${REDACTED}\n\n${reason}`;
}

/**
 * The Prisma error code (P1001, P2002, ...) of a thrown value, if it has one. A request error
 * carries it as `code`, an initialization error as `errorCode`.
 */
export function prismaErrorCode(error: unknown): string | undefined {
  const { code, errorCode } =
    (error as { code?: unknown; errorCode?: unknown } | null) ?? {};
  const value = typeof code === 'string' ? code : errorCode;
  return typeof value === 'string' && /^P\d{4}$/.test(value)
    ? value
    : undefined;
}

const MAX_CAUSE_DEPTH = 5;

/**
 * What a server log line may carry for a caught error. A string comes back scrubbed and any
 * other non-Error value unchanged. A non-Prisma Error whose message and cause need no scrubbing
 * comes back as itself. Anything else becomes a string `Name [code]: message`, where a message
 * with an invocation line is cut after it (`... invocation [arguments redacted]`). For a
 * value-free code (scrubPrismaError) the reason paragraph follows after a blank line. A
 * validation error without the invocation line keeps only `[arguments redacted]`. An Error
 * `cause` is redacted the same way (up to MAX_CAUSE_DEPTH levels) and appended as an indented
 * `[cause] Name: message` line.
 */
export function redactError(error: unknown, depth = 0): unknown {
  if (typeof error === 'string') return scrubPrismaText(error);
  if (!(error instanceof Error)) return error;

  const scrubbed = scrubPrismaError(error.message, prismaErrorCode(error));
  const isPrisma = error.name.startsWith('PrismaClient');
  const cause =
    error.cause !== undefined && depth < MAX_CAUSE_DEPTH
      ? redactError(error.cause, depth + 1)
      : error.cause;
  if (!isPrisma && scrubbed === error.message && cause === error.cause)
    return error;

  const message =
    error.name === 'PrismaClientValidationError' && scrubbed === error.message
      ? REDACTED.trim()
      : scrubbed;
  const code =
    'code' in error && typeof error.code === 'string' ? ` [${error.code}]` : '';
  const causeLine =
    error.cause === undefined
      ? ''
      : `\n  [cause] ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`;
  return `${error.name}${code}: ${message}${causeLine}`;
}
