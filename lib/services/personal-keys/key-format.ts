import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

// Personal key = `ifk_` + 43 base62 chars (32 random bytes, left-padded) + 6 base62 checksum
// chars = 53 chars (ADR-0004, openapi PersonalKeyValue). Only the SHA-256 digest is ever stored.

const PREFIX = 'ifk_';
const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SECRET_LENGTH = 43;
const CHECKSUM_LENGTH = 6;
const KEY_LENGTH = PREFIX.length + SECRET_LENGTH + CHECKSUM_LENGTH;
const BASE_62_ONLY = /^[0-9A-Za-z]+$/;

const ZERO = BigInt(0);
const BASE = BigInt(62);

function toBase62(value: bigint, length: number): string {
  let out = '';
  let rest = value;
  while (rest > ZERO) {
    out = ALPHABET[Number(rest % BASE)] + out;
    rest /= BASE;
  }
  return out.padStart(length, '0');
}

function checksumOf(prefixedSecret: string): string {
  const hash = createHash('sha256').update(prefixedSecret).digest();
  const value =
    BigInt(`0x${hash.subarray(0, 8).toString('hex')}`) %
    BASE ** BigInt(CHECKSUM_LENGTH);
  return toBase62(value, CHECKSUM_LENGTH);
}

export function digestKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generatePersonalKey(): {
  fullKey: string;
  digest: string;
  lastFour: string;
} {
  const secret = toBase62(
    BigInt(`0x${randomBytes(32).toString('hex')}`),
    SECRET_LENGTH
  );
  const prefixed = PREFIX + secret;
  const fullKey = prefixed + checksumOf(prefixed);
  return { fullKey, digest: digestKey(fullKey), lastFour: fullKey.slice(-4) };
}

/** Shape checks only (prefix, length, alphabet, checksum); never throws, never touches a store. */
export function isWellFormedKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== KEY_LENGTH) return false;
  if (!value.startsWith(PREFIX)) return false;
  const body = value.slice(PREFIX.length);
  if (!BASE_62_ONLY.test(body)) return false;
  const prefixed = value.slice(0, PREFIX.length + SECRET_LENGTH);
  return checksumOf(prefixed) === value.slice(-CHECKSUM_LENGTH);
}
