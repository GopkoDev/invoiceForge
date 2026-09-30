// Safe, IP-pinning image fetcher (T03, AC-03, ADR-0003).
//
// Why no `undici` dependency: `undici` is not a direct dependency of this project today
// (package.json). ADR-0003 keeps this small, security-critical module under review rather than
// behind a dependency whose `fetch` support the team can't verify, so this uses Node's built-in
// `node:https` with a literal pinned IP as the connect target instead. Because the DNS answer is
// resolved once via the injected `DnsResolver` and that exact address is what we connect to
// (never re-resolved), there is no window for a second lookup - and therefore no DNS-rebinding
// bypass - between the check and the connection.
//
// Transport note: the wire connection is genuine TLS (`node:https`), with full certificate
// verification (`rejectUnauthorized` stays true - never set to false). The socket connects to
// the pinned, already-checked IP address (`host: pinned.address`), while `servername` and the
// `Host` header are set to the original hostname, so `tls.checkServerIdentity` verifies the
// certificate against the real hostname the link named - not the bare IP. This gives both
// properties at once: the connection never triggers a second, unpinned DNS lookup (defeating
// rebinding, ADR-0003), and the certificate is still checked against the hostname the operator
// actually intended to reach. `SafeFetcherOverrides.ca` lets a test add an extra trust anchor
// (e.g. a fixture's self-signed root) without touching `rejectUnauthorized`.

import https from 'node:https';
import dns from 'node:dns/promises';

const MAX_BYTES = 512 * 1024; // sad.md §6 NFR, "Logo fetch - size cap"
const TIMEOUT_MS = 5000; // sad.md §6 NFR, "Logo fetch - time cap"
const MAX_REDIRECTS = 3; // sad.md §6, flow 1 safe-fetcher steps

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface DnsResolver {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
}

/** The real resolver, backed by Node's `dns.promises`. Production default. */
export function createNodeDnsResolver(): DnsResolver {
  return {
    async resolve(hostname: string): Promise<ResolvedAddress[]> {
      const results = await dns.lookup(hostname, { all: true });
      return results.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
    },
  };
}

export type SafeFetchRefusalCode = 'NOT_HTTPS' | 'NOT_IMAGE' | 'TOO_LARGE' | 'UNAVAILABLE';

export type SafeFetchResult =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; code: SafeFetchRefusalCode; reason: string };

// The `reason` values below are for the `logo_fetch outcome=… reason=…` log line only (sad.md
// §7, Monitoring) - never returned to a caller. The messages a caller/UI may show live in
// REFUSAL_MESSAGES, keyed only by the closed refusal-code set.
// F-24: this is the *only* refusal-message table - app/api/convert-image/route.ts's REFUSAL_BODIES
// builds its response `error` text from these exact strings (openapi.yaml's LogoFetchRefusal
// examples), instead of keeping its own separate, never-exercised copy.
export const REFUSAL_MESSAGES: Record<SafeFetchRefusalCode, string> = {
  NOT_HTTPS: 'The logo link is not a secure web address.',
  NOT_IMAGE: 'The logo file is not an image.',
  TOO_LARGE: 'The logo file is larger than 512 KB.',
  UNAVAILABLE: 'The logo could not be loaded from this link.',
};

// F-19: a sentinel (not an Error subclass) so `withDeadline`'s own rejection can never be
// confused with a real error the wrapped promise rejects with.
const DNS_DEADLINE_EXCEEDED = Symbol('dns-deadline-exceeded');

/** Races `promise` against `ms` - rejects with `DNS_DEADLINE_EXCEEDED` if the deadline wins. The
 * underlying promise (e.g. a stalling `dns.lookup`) may still settle later in the background; the
 * caller is just never kept waiting for it past the deadline. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(DNS_DEADLINE_EXCEEDED), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function logOutcome(outcome: string, reason: string): void {
  // host/IP never appear here - only the closed outcome/reason vocabulary (sad.md §7).
  console.log(`logo_fetch outcome=${outcome} reason=${reason}`);
}

// --- IP-range classifier (sad.md §11 risk row "private-address classification") -------------

function isPrivateIPv4(a: number, b: number, c: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8, "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24, IETF protocol assignments
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15, benchmarking
  if (a >= 224 && a <= 239) return true; // multicast
  if (a >= 240) return true; // 240.0.0.0/4, reserved (incl. 255.255.255.255 broadcast)
  return false;
}

function parseIPv4(literal: string): [number, number, number, number] | null {
  const parts = literal.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

/**
 * Expands any legal IPv6 textual form (with `::` compression and/or an embedded dotted IPv4
 * tail, e.g. `::ffff:127.0.0.1` or `64:ff9b::7f00:1`) into 8 16-bit groups.
 */
function ipv6ToGroups(input: string): number[] | null {
  let addr = input;
  const pct = addr.indexOf('%');
  if (pct !== -1) addr = addr.slice(0, pct); // strip zone id

  const lastColon = addr.lastIndexOf(':');
  const tail = addr.slice(lastColon + 1);
  if (tail.includes('.')) {
    const quad = parseIPv4(tail);
    if (!quad) return null;
    const hi = ((quad[0] << 8) | quad[1]).toString(16);
    const lo = ((quad[2] << 8) | quad[3]).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  let head: string[];
  let tailGroups: string[];
  if (addr.includes('::')) {
    const [h, t] = addr.split('::');
    head = h ? h.split(':') : [];
    tailGroups = t ? t.split(':') : [];
    const missing = 8 - head.length - tailGroups.length;
    if (missing < 0) return null;
    const groups = [...head, ...new Array(missing).fill('0'), ...tailGroups];
    if (groups.length !== 8) return null;
    return groups.map((g) => parseInt(g, 16));
  }
  const groups = addr.split(':');
  if (groups.length !== 8) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isPrivateIPv6(groups: number[]): boolean {
  // IPv4-mapped IPv6, ::ffff:0:0/96
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    const c = (groups[7] >> 8) & 0xff;
    return isPrivateIPv4(a, b, c);
  }
  // SIIT, ::ffff:0:0:0/96 (RFC 6145), IPv4 in the last 32 bits (R-13)
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0xffff && groups[5] === 0) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    const c = (groups[7] >> 8) & 0xff;
    return isPrivateIPv4(a, b, c);
  }
  // Local-use NAT64, 64:ff9b:1::/48 (RFC 8215): never globally routable, and operators may pick
  // a /48–/96 prefix inside it, so the IPv4 can sit anywhere - classified unsafe outright (R-13)
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 1) return true;
  // NAT64, 64:ff9b::/96
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    const c = (groups[7] >> 8) & 0xff;
    return isPrivateIPv4(a, b, c);
  }
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  // ::/96, IPv4-compatible IPv6 (deprecated, RFC4291) - top 96 bits zero. Covers ::, ::1 and any
  // ::a.b.c.d form too; classified unsafe regardless of the embedded IPv4 (F-23).
  if (groups.slice(0, 6).every((g) => g === 0)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7, ULA
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8, multicast (F-23)
  if ((groups[0] & 0xffc0) === 0xfec0) return true; // fec0::/10, deprecated site-local (F-23)
  return false;
}

export function isPrivateOrInternalAddress(address: string, family: 4 | 6): boolean {
  if (family === 4) {
    const quad = parseIPv4(address);
    if (!quad) return true; // unparsable -> treat as unsafe, never guess it's public
    return isPrivateIPv4(quad[0], quad[1], quad[2]);
  }
  const groups = ipv6ToGroups(address);
  if (!groups) return true;
  return isPrivateIPv6(groups);
}

// --- URL/scheme gate --------------------------------------------------------------------------

export function validateFetchUrl(
  url: string
): { ok: true; hostname: string } | { ok: false; code: 'NOT_HTTPS'; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: 'NOT_HTTPS', reason: 'unparsable_url' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, code: 'NOT_HTTPS', reason: 'not_https' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, code: 'NOT_HTTPS', reason: 'credentials_in_url' };
  }
  return { ok: true, hostname: parsed.hostname };
}

// --- Fetcher -----------------------------------------------------------------------------------

export interface SafeFetcherOverrides {
  resolver?: DnsResolver;
  isPrivateAddress?: (address: string, family: 4 | 6) => boolean;
  /** Extra TLS trust anchor (e.g. a test fixture's self-signed root). Never disables
   * certificate verification - `rejectUnauthorized` always stays `true`. */
  ca?: string | Buffer;
}

interface HopResult {
  kind: 'redirect' | 'failure' | 'success';
  location?: string;
  code?: SafeFetchRefusalCode;
  reason?: string;
  bytes?: Buffer;
  contentType?: string;
}

function performHop(
  targetUrl: string,
  hostname: string,
  pinned: ResolvedAddress,
  timeoutMs: number,
  ca: string | Buffer | undefined
): Promise<HopResult> {
  return new Promise((resolve) => {
    const parsed = new URL(targetUrl);
    const port = parsed.port ? Number(parsed.port) : 443;
    let settled = false;
    let timedOut = false;
    let tooLarge = false;

    const finish = (result: HopResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      req.destroy();
    }, timeoutMs);

    const req = https.request(
      {
        host: pinned.address,
        port,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: { Host: hostname, Connection: 'close' },
        // Pinned to the checked address (no second DNS lookup), but the certificate is still
        // verified against the *hostname* the link named, not the bare IP - tls.checkServerIdentity
        // compares the cert's names against `servername`, never against `host`.
        servername: hostname,
        rejectUnauthorized: true,
        ca,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          finish({ kind: 'redirect', location: res.headers.location });
          return;
        }
        // F-17: only a genuine 2xx is ever treated as a usable body - a 404/500 (even one served
        // with an `image/*` content-type) is refused on status alone, never embedded as the logo.
        if (status < 200 || status >= 300) {
          res.resume();
          finish({ kind: 'failure', code: 'UNAVAILABLE', reason: 'http_status' });
          return;
        }

        const contentType = res.headers['content-type'] ?? '';
        if (!contentType.toLowerCase().startsWith('image/')) {
          res.resume();
          finish({ kind: 'failure', code: 'NOT_IMAGE', reason: 'content_type' });
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BYTES) {
            tooLarge = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          finish({ kind: 'success', bytes: Buffer.concat(chunks), contentType });
        });
        const onPrematureClose = () => {
          if (tooLarge) {
            finish({ kind: 'failure', code: 'TOO_LARGE', reason: 'size' });
          } else if (timedOut) {
            finish({ kind: 'failure', code: 'UNAVAILABLE', reason: 'timeout' });
          } else {
            // The connection closed before the body was complete (a dropped connection, or fewer
            // bytes than the declared Content-Length): a possibly truncated image is never used.
            finish({ kind: 'failure', code: 'UNAVAILABLE', reason: 'incomplete' });
          }
        };
        res.on('aborted', onPrematureClose);
        res.on('close', onPrematureClose);
      }
    );

    req.on('error', () => {
      if (timedOut) {
        finish({ kind: 'failure', code: 'UNAVAILABLE', reason: 'timeout' });
      } else {
        finish({ kind: 'failure', code: 'UNAVAILABLE', reason: 'connect' });
      }
    });

    req.end();
  });
}

export function createSafeFetcher(overrides: SafeFetcherOverrides = {}): {
  safeFetchImage(url: string): Promise<SafeFetchResult>;
} {
  const resolver = overrides.resolver ?? createNodeDnsResolver();
  const isPrivate = overrides.isPrivateAddress ?? isPrivateOrInternalAddress;
  const ca = overrides.ca;

  function refuse(code: SafeFetchRefusalCode, reason: string): SafeFetchResult {
    logOutcome(code, reason);
    return { ok: false, code, reason };
  }

  async function safeFetchImage(url: string): Promise<SafeFetchResult> {
    const deadline = Date.now() + TIMEOUT_MS;
    let currentUrl = url;
    let hop = 0;

    while (true) {
      const validated = validateFetchUrl(currentUrl);
      if (!validated.ok) {
        // Only the original, stored link's own scheme is reported as NOT_HTTPS. A redirect that
        // downgrades scheme mid-chain must not reveal that distinction (edge case table).
        if (hop === 0) return refuse('NOT_HTTPS', validated.reason);
        return refuse('UNAVAILABLE', 'redirect_scheme');
      }

      const preDnsRemainingMs = deadline - Date.now();
      if (preDnsRemainingMs <= 0) {
        return refuse('UNAVAILABLE', 'timeout');
      }

      // F-19: DNS resolution is bounded by the same 5s deadline as the rest of the fetch - a
      // stalling resolver must not hold the request open past it (it may still occupy the libuv
      // threadpool in the background, but the caller is never kept waiting for it).
      let addresses: ResolvedAddress[];
      try {
        addresses = await withDeadline(resolver.resolve(validated.hostname), preDnsRemainingMs);
      } catch (err) {
        if (err === DNS_DEADLINE_EXCEEDED) {
          return refuse('UNAVAILABLE', 'timeout');
        }
        return refuse('UNAVAILABLE', 'dns');
      }
      if (!addresses || addresses.length === 0) {
        return refuse('UNAVAILABLE', 'dns');
      }
      // If *any* answer is private/internal, refuse - never connect (edge case table: "resolves
      // to both a public and a private address").
      if (addresses.some((a) => isPrivate(a.address, a.family))) {
        return refuse('UNAVAILABLE', 'blocked_ip');
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return refuse('UNAVAILABLE', 'timeout');
      }

      // Pin the connection to the address that was just checked - resolver.resolve() is never
      // called again for this hop, so a second/rebinding answer can never be connected to.
      const pinned = addresses[0];
      const hopResult = await performHop(currentUrl, validated.hostname, pinned, remainingMs, ca);

      if (hopResult.kind === 'redirect') {
        hop += 1;
        if (hop > MAX_REDIRECTS) {
          return refuse('UNAVAILABLE', 'redirects');
        }
        // F-22: a malformed `Location` must never throw uncaught (an unhandled 500 with no log
        // line) - it is refused like any other bad hop, logged the same as every other refusal.
        try {
          currentUrl = new URL(hopResult.location as string, currentUrl).toString();
        } catch {
          return refuse('UNAVAILABLE', 'malformed_redirect');
        }
        continue;
      }

      if (hopResult.kind === 'failure') {
        return refuse(hopResult.code as SafeFetchRefusalCode, hopResult.reason as string);
      }

      logOutcome('ok', 'success');
      return { ok: true, bytes: hopResult.bytes as Buffer, contentType: hopResult.contentType as string };
    }
  }

  return { safeFetchImage };
}

/** Production singleton - what T05's endpoint imports. */
export const safeFetchImage: (url: string) => Promise<SafeFetchResult> =
  createSafeFetcher().safeFetchImage;
