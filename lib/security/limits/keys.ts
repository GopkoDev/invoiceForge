// Limit keys (sad.md §8, TD-1). Keys are HMAC-SHA256 digests under LIMIT_KEY_SECRET; raw
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

/** First four hextets of an IPv6 address (its /64 network), fully expanded. */
function ipv6Prefix64(ip: string): string {
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
    right === undefined ? [] : Array<string>(Math.max(0, 8 - l.length - r.length)).fill('0');
  return [...l, ...fill, ...r]
    .slice(0, 4)
    .map((h) => h.padStart(4, '0'))
    .join(':');
}

export function sourceLimitKey(ip: string): string {
  return digest(isIPv6(ip) ? `${ipv6Prefix64(ip)}::/64` : ip);
}

/** The client address as reported by the hosting platform, never a client-settable header. */
export function clientSource(request: Request): string | undefined {
  return ipAddress(request);
}
