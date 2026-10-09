// editor-ux T1 (spec.md §5 AC-01, AC-02, AC-02b; ADR-0001) — loadPdfKit() fetches the lazy PDF kit
// once per visit, and classifies a failed import as offline (origin unreachable) or new-version
// (origin reachable, chunk gone). A failed load clears the cache so try-again re-fetches.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KIT = '@/lib/pdf/invoice-pdf-kit';

const fakeKit = {
  generatePdfBlob: vi.fn(),
  downloadPdf: vi.fn(),
  printPdf: vi.fn(),
  InvoicePdfDocument: vi.fn(),
};

let kitFactory: ReturnType<typeof vi.fn<() => Record<string, unknown>>>;

async function freshLoader() {
  vi.resetModules();
  vi.doMock(KIT, () => kitFactory());
  return import('@/lib/pdf/load-pdf-kit');
}

beforeEach(() => {
  kitFactory = vi.fn(() => fakeKit);
});

afterEach(() => {
  vi.doUnmock(KIT);
  vi.unstubAllGlobals();
});

describe('loadPdfKit', () => {
  it('AC-01: reuses the first promise, so the kit is fetched once per visit', async () => {
    const { loadPdfKit } = await freshLoader();
    const first = loadPdfKit();
    const second = loadPdfKit();
    expect(second).toBe(first);
    const kit = await first;
    expect(kit.downloadPdf).toBe(fakeKit.downloadPdf);
    await loadPdfKit();
    expect(kitFactory).toHaveBeenCalledTimes(1);
  });

  it('AC-02: failed import + unreachable origin -> PdfKitLoadError kind "offline"', async () => {
    kitFactory.mockImplementation(() => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { loadPdfKit, PdfKitLoadError } = await freshLoader();
    const err = await loadPdfKit().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfKitLoadError);
    expect((err as InstanceType<typeof PdfKitLoadError>).kind).toBe('offline');
  });

  it('AC-02b: failed import + reachable origin -> PdfKitLoadError kind "new-version"', async () => {
    kitFactory.mockImplementation(() => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const { loadPdfKit, PdfKitLoadError } = await freshLoader();
    const err = await loadPdfKit().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfKitLoadError);
    expect((err as InstanceType<typeof PdfKitLoadError>).kind).toBe('new-version');
  });

  it('AC-02: a failed load clears the cache, so the next call fetches again and succeeds', async () => {
    kitFactory.mockImplementationOnce(() => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { loadPdfKit } = await freshLoader();
    await expect(loadPdfKit()).rejects.toMatchObject({ kind: 'offline' });
    const kit = await loadPdfKit();
    expect(kit.generatePdfBlob).toBe(fakeKit.generatePdfBlob);
    expect(kitFactory).toHaveBeenCalledTimes(2);
  });
});
