export const WEB_ADDRESS_MESSAGE = 'The address must start with http:// or https://.';

/** True only for values whose parsed protocol is http: or https: (AC-21). */
export function isWebAddress(value: string): boolean {
  // new URL() silently strips surrounding whitespace; the rule must not accept it.
  if (value !== value.trim()) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
