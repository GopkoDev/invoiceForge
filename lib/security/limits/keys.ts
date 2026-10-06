// Limit keys. Keys are HMAC-SHA256 digests under LIMIT_KEY_SECRET; raw
// addresses and network addresses are never stored or returned.
import { createHmac } from 'node:crypto';
import { isIPv6 } from 'node:net';
import { ipAddress } from '@vercel/functions';

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

function digest(value: string): string {
  const secret = process.env.LIMIT_KEY_SECRET;
  if (!secret) throw new Error('LIMIT_KEY_SECRET is not set');
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Folds case, a +tag and (Gmail only) local-part dots. Limit grouping only, never identity. */
export function foldAddress(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 0) return lower;
  let local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) local = local.replaceAll('.', '');
  return `${local}@${domain}`;
}

export function addressLimitKey(email: string): string {
  return digest(foldAddress(email));
}

/** All eight hextets of an IPv6 address, fully expanded (a dotted IPv4 tail folded in). */
function expandIpv6(ip: string): string[] {
  let addr = ip.split('%')[0]!.toLowerCase();
  const v4 = addr.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [, head, a, b, c, d] = v4;
    const hi = ((Number(a) << 8) | Number(b)).toString(16);
    const lo = ((Number(c) << 8) | Number(d)).toString(16);
    addr = `${head}${hi}:${lo}`;
  }
  const [left = '', right] = addr.split('::');
  const l = left ? left.split(':') : [];
  const r = right ? right.split(':') : [];
  const fill =
    right === undefined
      ? []
      : Array<string>(Math.max(0, 8 - l.length - r.length)).fill('0');
  return [...l, ...fill, ...r].map((h) => h.padStart(4, '0'));
}

/** The IPv4 address behind an IPv4-mapped IPv6 address (::ffff:a.b.c.d), else undefined. */
function mappedIpv4(hextets: string[]): string | undefined {
  if (hextets.slice(0, 5).some((h) => h !== '0000') || hextets[5] !== 'ffff')
    return undefined;
  const [hi = 0, lo = 0] = hextets.slice(6).map((h) => parseInt(h, 16));
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

// A mapped address is one IPv4 client. Keying it by its /64 would pool every IPv4 client
// of a dual-stack listener into one shared source.
export function sourceLimitKey(ip: string): string {
  if (!isIPv6(ip)) return digest(ip);
  const hextets = expandIpv6(ip);
  return digest(mappedIpv4(hextets) ?? `${hextets.slice(0, 4).join(':')}::/64`);
}

/** The client address as reported by the hosting platform, never a client-settable header. */
export function clientSource(input: Request | Headers): string | undefined {
  // next/headers' headers() object keeps the raw Node header map in its own `headers` field,
  // which ipAddress() would mistake for a Request's; so a Headers always goes in wrapped.
  return ipAddress(input instanceof Headers ? { headers: input } : input);
}
