// T16 (ai-assistant; ADR-0007, ADR-0012): the content fingerprint of a draft request - the lower-case
// hex SHA-256 of its canonical form (keys sorted at every depth, text trimmed, array order kept).
import 'server-only';
import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonical(v);
    }
    return out;
  }
  return value;
}

export function fingerprintRequest(request: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex');
}
