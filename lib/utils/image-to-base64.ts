// T06 (spec.md §5 AC-01/AC-03, ADR-0003, screens.md §SCR-04) - the browser client for
// /api/convert-image. Requests are made by sender-profile id only (never a URL, per T05's
// rewrite of the route), successful results are cached per session (ADR-0003) so a repeated
// render doesn't re-count against the rate limit, and every refusal code is mapped to the
// plain-language warning screens.md §SCR-04 declares.

export type FetchLogoDataUrlResult =
  | { dataUrl: string }
  | { warning: string }
  | { unauthorized: true };

const GENERIC_UNAVAILABLE_WARNING = 'The logo could not be loaded from this link.';

// Successful results only (checklist: "so a retry after a transient error is possible"). Keyed
// by (senderProfileId, logo URL) rather than senderProfileId alone (F-49): a profile id alone
// kept showing a stale cached logo after the Freelancer changed the URL, until a full reload.
const sessionCache = new Map<string, { dataUrl: string }>();

function cacheKey(senderProfileId: string, logoUrl: string): string {
  return `${senderProfileId}::${logoUrl}`;
}

interface ConvertImageResponseBody {
  success: boolean;
  code?: string;
  error?: string;
  data?: { dataUrl: string };
}

async function requestLogoDataUrl(
  senderProfileId: string
): Promise<FetchLogoDataUrlResult> {
  let response: Response;
  try {
    response = await fetch('/api/convert-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderProfileId }),
    });
  } catch {
    return { warning: GENERIC_UNAVAILABLE_WARNING };
  }

  if (response.status === 401) {
    return { unauthorized: true };
  }

  let body: ConvertImageResponseBody;
  try {
    body = await response.json();
  } catch {
    return { warning: GENERIC_UNAVAILABLE_WARNING };
  }

  if (!response.ok || !body.success) {
    return { warning: body.error ?? GENERIC_UNAVAILABLE_WARNING };
  }

  return { dataUrl: body.data!.dataUrl };
}

/**
 * Fetches a sender profile's logo as a data URL through /api/convert-image, by profile id
 * only. Successful results are cached for the lifetime of the session (module scope) so a
 * logo reused across renders/exports doesn't count against the per-minute rate limit again.
 */
export async function fetchLogoDataUrl(
  senderProfileId: string,
  logoUrl: string = ''
): Promise<FetchLogoDataUrlResult> {
  const key = cacheKey(senderProfileId, logoUrl);
  const cached = sessionCache.get(key);
  if (cached) return cached;

  const result = await requestLogoDataUrl(senderProfileId);

  if ('dataUrl' in result) {
    sessionCache.set(key, result);
  }

  return result;
}
