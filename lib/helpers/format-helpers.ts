/**
 * Format location string from city and country
 * @param city - City name
 * @param country - Country name
 * @returns Formatted location string or undefined if both are empty
 */
export function formatLocation(
  city?: string | null,
  country?: string | null
): string | undefined {
  if (city && country) return `${city}, ${country}`;
  return city || country || undefined;
}

/**
 * Format full address from address parts
 * @param parts - Array of address parts (address, city, postalCode, country)
 * @returns Formatted address string
 */
export function formatFullAddress(
  parts: (string | null | undefined)[]
): string {
  return parts.filter(Boolean).join(', ');
}
