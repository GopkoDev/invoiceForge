// editor-ux T31 (review S4): the build gate must fail on a chunk listed in a manifest but missing
// on disk, and needs a positive control (some chunk must contain the toolkit marker).
// Assumed interface (implementer to add): `export function runPdfChunkCheck(distDir: string): number`
// in scripts/check-pdf-chunks.ts (the current private `run`), returning the exit code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mod from '../../scripts/check-pdf-chunks';

const MARKER = mod.PDF_TOOLKIT_MARKERS[0];
const dirs: string[] = [];

function fakeBuild(opts: { chunks: Record<string, string | null>; editorChunks?: string[] }): string {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfchunks-'));
  dirs.push(dist);
  const manifestFor = (route: string, chunks: string[]) => {
    const file = path.join(dist, 'server', 'app', route.replace(/\//g, '_'), 'page_client-reference-manifest.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const json = JSON.stringify({ clientModules: { m: { chunks } } });
    fs.writeFileSync(file, `globalThis.__RSC_MANIFEST = {};\nglobalThis.__RSC_MANIFEST["${route}/page"] = ${json};`);
  };
  manifestFor('/dashboard', Object.keys(opts.chunks).map((c) => `/_next/${c}`));
  manifestFor('/invoices/new', (opts.editorChunks ?? []).map((c) => `/_next/${c}`));
  fs.writeFileSync(
    path.join(dist, 'app-path-routes-manifest.json'),
    JSON.stringify({ '/dashboard/page': '/dashboard', '/invoices/new/page': '/invoices/new' }),
  );
  for (const [c, body] of Object.entries({ ...opts.chunks })) {
    if (body === null) continue;
    fs.mkdirSync(path.dirname(path.join(dist, c)), { recursive: true });
    fs.writeFileSync(path.join(dist, c), body);
  }
  return dist;
}

function runCheck(dist: string): { code: number; out: string } {
  const fn = (mod as unknown as { runPdfChunkCheck?: (d: string) => number }).runPdfChunkCheck;
  if (!fn) throw new Error('runPdfChunkCheck is not exported from scripts/check-pdf-chunks');
  const lines: string[] = [];
  const e = vi.spyOn(console, 'error').mockImplementation((...a) => void lines.push(a.join(' ')));
  const l = vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')));
  try {
    return { code: fn(dist), out: lines.join('\n') };
  } finally {
    e.mockRestore();
    l.mockRestore();
  }
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('check-pdf-chunks build gate (T31)', () => {
  it('fails naming a chunk that the manifest lists but is missing on disk', () => {
    const dist = fakeBuild({
      chunks: { 'static/chunks/gone.js': null, 'static/chunks/ok.js': 'var a=1;' },
      editorChunks: ['static/chunks/pdf.js'],
    });
    fs.mkdirSync(path.join(dist, 'static/chunks'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'static/chunks/pdf.js'), `var a="${MARKER}";`);
    const { code, out } = runCheck(dist);
    expect(code).not.toBe(0);
    expect(out).toContain('static/chunks/gone.js');
  });

  it('fails the positive control when no chunk contains the PDF toolkit', () => {
    const dist = fakeBuild({ chunks: { 'static/chunks/ok.js': 'var a=1;' } });
    const { code, out } = runCheck(dist);
    expect(code).not.toBe(0);
    expect(out).toContain('positive control: no chunk contains the PDF toolkit');
  });

  it('passes when the toolkit is only in the editor-route chunk', () => {
    const dist = fakeBuild({
      chunks: { 'static/chunks/ok.js': 'var a=1;' },
      editorChunks: ['static/chunks/pdf.js'],
    });
    fs.writeFileSync(path.join(dist, 'static/chunks/pdf.js'), `var a="${MARKER}";`);
    expect(runCheck(dist).code).toBe(0);
  });
});
