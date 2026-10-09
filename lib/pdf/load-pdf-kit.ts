// editor-ux T1 (ADR-0001): the PDF toolkit is fetched on demand, once per visit.
export type PdfKit = typeof import('./invoice-pdf-kit');

export class PdfKitLoadError extends Error {
  readonly kind: 'offline' | 'new-version';

  constructor(kind: 'offline' | 'new-version', options?: { cause?: unknown }) {
    super(
      kind === 'offline'
        ? 'The PDF toolkit could not be fetched: the connection looks offline.'
        : 'The PDF toolkit is gone: a newer version of the app is available.',
      options
    );
    this.name = 'PdfKitLoadError';
    this.kind = kind;
  }
}

let cached: Promise<PdfKit> | null = null;

/**
 * Probes the app's own origin: unreachable means offline, reachable means the app was updated.
 * A redirect (signed-in visitors leave `/`) is not followed - any answer proves the origin is up.
 */
async function classifyFailure(cause: unknown): Promise<PdfKitLoadError> {
  try {
    await fetch('/', { method: 'HEAD', cache: 'no-store', redirect: 'manual' });
    return new PdfKitLoadError('new-version', { cause });
  } catch {
    return new PdfKitLoadError('offline', { cause });
  }
}

export function loadPdfKit(): Promise<PdfKit> {
  if (!cached) {
    cached = import('./invoice-pdf-kit').catch(async (cause: unknown) => {
      cached = null;
      throw await classifyFailure(cause);
    });
  }
  return cached;
}
