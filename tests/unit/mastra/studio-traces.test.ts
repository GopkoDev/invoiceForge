// fix 2026-10-12 (ai-assistant, ADR-0004, spec §1 "Debugging traces hold metadata only"): Mastra Studio
// (`pnpm studio`) showed none of the app's chats. The app writes its metadata-only traces to the `mastra` schema
// of the .env database, while Studio read only its own local file. With STUDIO_TRACES=app, Studio reads the
// app's traces over a read-only connection: it never creates or alters the app's tables and exports no
// full-text spans of its own there. No database is touched here: the stores connect lazily.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/prisma', () => ({ prisma: {} })); // the agent's tool chain loads Prisma; nothing here queries it

const APP_DB = 'postgresql://user:pass@localhost:5432/unused?sslmode=disable';

async function studio(traces?: string) {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', APP_DB);
  const repoRoot = mkdtempSync(join(tmpdir(), 'studio-'));
  mkdirSync(join(repoRoot, '.mastra'));
  vi.stubEnv('INIT_CWD', repoRoot);
  if (traces !== undefined) vi.stubEnv('STUDIO_TRACES', traces);
  return (await import('@/mastra/index')).mastra;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Mastra Studio traces (fix 2026-10-12)', () => {
  it("STUDIO_TRACES=app: the traces Studio lists are the app's, in the `mastra` schema of the .env database", async () => {
    const mastra = await studio('app');

    const traces = (await mastra
      .getStorage()!
      .getStore('observability')) as unknown as {
      constructor: { name: string };
    };

    expect(traces.constructor.name).toBe('ObservabilityPG');
  });

  it("STUDIO_TRACES=app: Studio starts without creating or altering the app's tables, and writes no spans there", async () => {
    const mastra = await studio('app');

    // A real init would try to reach the placeholder database and fail.
    await expect(mastra.getStorage()!.init()).resolves.toBeUndefined();
    expect(
      mastra.observability.getDefaultInstance()?.getExporters() ?? []
    ).toEqual([]);
  });

  it('by default Studio keeps its own full-text traces in the local file', async () => {
    const mastra = await studio();

    const traces = (await mastra
      .getStorage()!
      .getStore('observability')) as unknown as {
      constructor: { name: string };
    };

    expect(traces.constructor.name).not.toBe('ObservabilityPG');
    expect(
      (mastra.observability.getDefaultInstance()?.getExporters() ?? []).map(
        (e) => e.name
      )
    ).toEqual(['mastra-storage-exporter']);
  });
});
