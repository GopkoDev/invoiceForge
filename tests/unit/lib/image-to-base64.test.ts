// T06 (spec.md §5 AC-01/AC-03, ADR-0003, screens.md §SCR-04) - the browser client for
// /api/convert-image must request by sender-profile id only (never a URL), cache successful
// results per session so a repeated render doesn't re-count against the rate limit, and map
// each refusal code to the plain-language warning screens.md §SCR-04 declares.
//
// Task checklist (t06-pdf-logo-client-and-warning.md): "Replace the URL-based converter with
// fetchLogoDataUrl(senderProfileId) returning { dataUrl } | { warning: string } | { unauthorized:
// true }" + "Add a module-level Map<senderProfileId, Promise<result>> cache ... (successful
// results only, so a retry after a transient error is possible)".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLogoDataUrl } from '@/lib/utils/image-to-base64';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('fetchLogoDataUrl (AC-01, AC-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests /api/convert-image with { senderProfileId } - never a URL - and resolves { dataUrl } on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { dataUrl: 'data:image/png;base64,AAAA', contentType: 'image/png', size: 4 },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLogoDataUrl('profile-1');

    expect(result).toEqual({ dataUrl: 'data:image/png;base64,AAAA' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/convert-image');
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({ senderProfileId: 'profile-1' });
    expect(sentBody.imageUrl).toBeUndefined();
  });

  it('does not refetch for the same sender-profile id within a session (session cache)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { dataUrl: 'data:image/png;base64,AAAA', contentType: 'image/png', size: 4 },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchLogoDataUrl('profile-cached');
    const second = await fetchLogoDataUrl('profile-cached');

    expect(first).toEqual({ dataUrl: 'data:image/png;base64,AAAA' });
    expect(second).toEqual({ dataUrl: 'data:image/png;base64,AAAA' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['NOT_HTTPS', 'The logo link is not a secure web address.'],
    ['NOT_IMAGE', 'The logo file is not an image.'],
    ['TOO_LARGE', 'The logo file is larger than 512 KB.'],
    ['RATE_LIMITED', 'Too many requests, try again in a minute.'],
  ])(
    '%s maps to its specific verbatim warning (AC-03)',
    async (code, error) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(422, { success: false, code, error }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchLogoDataUrl(`profile-${code}`);

      expect(result).toEqual({ warning: error });
    }
  );

  it('maps UNAVAILABLE to the generic "could not be loaded" warning without revealing why', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(502, {
        success: false,
        code: 'UNAVAILABLE',
        error: 'The logo could not be loaded from this link.',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLogoDataUrl('profile-unavailable');

    expect(result).toEqual({
      warning: 'The logo could not be loaded from this link.',
    });
  });

  it('treats a network error calling the endpoint as UNAVAILABLE (edge case table)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLogoDataUrl('profile-network-error');

    expect(result).toEqual({
      warning: 'The logo could not be loaded from this link.',
    });
  });

  it('does not cache a failed/warning result, so a retry can succeed (checklist)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(502, {
          success: false,
          code: 'UNAVAILABLE',
          error: 'The logo could not be loaded from this link.',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { dataUrl: 'data:image/png;base64,BBBB', contentType: 'image/png', size: 4 },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchLogoDataUrl('profile-retry');
    expect(first).toEqual({ warning: 'The logo could not be loaded from this link.' });

    const second = await fetchLogoDataUrl('profile-retry');
    expect(second).toEqual({ dataUrl: 'data:image/png;base64,BBBB' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves { unauthorized: true } on a 401, without a warning message (SCR-01)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { success: false, code: 'NotSignedIn', error: 'Not signed in.' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLogoDataUrl('profile-unauthorized');

    expect(result).toEqual({ unauthorized: true });
  });
});
