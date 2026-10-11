import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { metadataOnlyProcessor } from '@/lib/ai/observability/metadata-only-processor';

type MastraModule = typeof import('@/lib/ai/mastra');

describe('Mastra observability registration (ADR-0004)', () => {
  let mod: MastraModule;

  beforeAll(async () => {
    // Placeholder URL: the store connects lazily, no database is touched.
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/unused');
    mod = await import('@/lib/ai/mastra');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('registers the metadata-only processor on the default instance', () => {
    const instance = mod.mastra.observability.getDefaultInstance();
    expect(instance).toBeDefined();
    expect(instance?.getSpanOutputProcessors()).toContain(metadataOnlyProcessor);
  });

  it('exports only to Mastra storage, no third-party exporter', () => {
    const instance = mod.mastra.observability.getDefaultInstance();
    const names = (instance?.getExporters() ?? []).map((e) => e.name);
    expect(names).toEqual(['mastra-storage-exporter']);
  });
});
