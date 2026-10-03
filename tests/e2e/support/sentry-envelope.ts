// T37 (spec.md §5 AC-20; review-2026-10-03-rereview R-16) — recognises the Sentry envelope that
// carries one particular client error. Every Sentry item (session updates, transactions, replays,
// logs) goes through the same /monitoring tunnel, so "the first POST answered 200" proves nothing
// about the error; the preview check waits for this envelope instead. Pure, so the unit suite
// (tests/unit/sentry-envelope-match.test.ts) runs the real predicate on every PR.

/** The message the release gate throws in the browser; one constant for the throw and the match. */
export const SYNTHETIC_CLIENT_ERROR = 'T20 synthetic client error';

function parse(line: string | undefined): Record<string, unknown> | undefined {
  if (!line) return undefined;
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the envelope body has an `event` item whose exception value carries `message`.
 * An envelope is a header line followed by (item header, payload) line pairs.
 */
export function isErrorEnvelopeFor(
  body: string | null,
  message: string
): boolean {
  if (!body) return false;
  const lines = body.split('\n');
  if (!parse(lines[0])) return false;
  for (let i = 1; i < lines.length; i += 2) {
    if (parse(lines[i])?.type !== 'event') continue;
    const exception = parse(lines[i + 1])?.exception as
      | { values?: unknown }
      | undefined;
    const values = Array.isArray(exception?.values) ? exception.values : [];
    if (
      values.some(
        (v) =>
          typeof (v as { value?: unknown })?.value === 'string' &&
          (v as { value: string }).value.includes(message)
      )
    ) {
      return true;
    }
  }
  return false;
}
