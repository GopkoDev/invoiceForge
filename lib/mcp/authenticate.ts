import 'server-only';
import {
  authenticatePersonalKey,
  type PersonalKeyAuthResult,
} from '@/lib/services/personal-keys/authenticate';
import {
  checkMcpSource,
  recordRefusedKeyCheck,
  takeMcpKeyCall,
  type McpLimitResult,
} from '@/lib/security/limits/mcp';
import { clientSource, sourceLimitKey } from '@/lib/security/limits/keys';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

// Request pipeline (sad.md critical flow 1), all before the JSON-RPC body is read:
// source limit -> Bearer key (never cookies) -> key check -> key limit.

export type McpPipelineResult =
  | { ok: true; actor: ActingFreelancer; keyId: string }
  | { ok: false; response: Response };

const BEARER = /^Bearer (\S+)$/i;

function jsonRpcError(
  status: number,
  code: number,
  message: string,
  data: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message, data } }),
    {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    }
  );
}

/** The one refusal for every key problem; byte-identical whatever the cause (AC-07, AC-26). */
export function keyRefusedResponse(): Response {
  return jsonRpcError(
    401,
    -32001,
    "This Personal key is not valid. Ask the Freelancer to create a key on the Connect your AI page in invoiceFlow and put it in this assistant's settings.",
    { code: 'UNAUTHORIZED' },
    { 'www-authenticate': 'Bearer realm="invoiceflow", error="invalid_token"' }
  );
}

function limitedResponse(kind: 'key' | 'source', retryAt: Date, now: Date) {
  const seconds = Math.max(
    1,
    Math.ceil((retryAt.getTime() - now.getTime()) / 1000)
  );
  const at = retryAt.toISOString();
  const message =
    kind === 'key'
      ? `Too many calls with this Personal key: at most 60 calls a minute. Try again after ${at}.`
      : `Too many refused key checks from this network. Try again after ${at}.`;
  return jsonRpcError(
    429,
    -32029,
    message,
    { code: 'RATE_LIMITED', details: { kind: 'RETRY_AT', retryAt: at } },
    { 'retry-after': String(seconds) }
  );
}

function limitStoreUnavailableResponse(): Response {
  return jsonRpcError(
    503,
    -32003,
    'invoiceFlow cannot check its call limits right now, so the call was refused. Try again in a few minutes.',
    { code: 'FAILED' }
  );
}

function refusal(
  result: McpLimitResult,
  kind: 'key' | 'source',
  now: Date
): Response | undefined {
  if ('unavailable' in result) return limitStoreUnavailableResponse();
  if (!result.allowed) return limitedResponse(kind, result.retryAt, now);
  return undefined;
}

/** Only the Authorization header is read; cookies are never looked at (AC-09, ADR-0003). */
export async function runMcpPipeline(
  request: Request,
  now: Date = new Date()
): Promise<McpPipelineResult> {
  const ip = clientSource(request);
  let sourceKey: string | undefined;
  if (ip) {
    sourceKey = sourceLimitKey(ip);
  } else if (process.env.VERCEL) {
    // The platform always sets the address; without it the source cannot be checked.
    return { ok: false, response: limitStoreUnavailableResponse() };
  }

  if (sourceKey) {
    const blocked = refusal(
      await checkMcpSource(sourceKey, now),
      'source',
      now
    );
    if (blocked) return { ok: false, response: blocked };
  }

  const presented = BEARER.exec(
    request.headers.get('authorization') ?? ''
  )?.[1];
  const auth: PersonalKeyAuthResult = presented
    ? await authenticatePersonalKey(presented, now)
    : { ok: false };
  if (!auth.ok) {
    // A store failure is not a refused key: no refused check is recorded against the source.
    if (auth.unavailable) return { ok: false, response: limitStoreUnavailableResponse() };
    if (sourceKey) await recordRefusedKeyCheck(sourceKey, now);
    return { ok: false, response: keyRefusedResponse() };
  }

  const limited = refusal(
    await takeMcpKeyCall(auth.keyId, auth.actor.userId, now),
    'key',
    now
  );
  if (limited) return { ok: false, response: limited };

  return { ok: true, actor: auth.actor, keyId: auth.keyId };
}
