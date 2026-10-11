// editor-ux T3 (spec §6 NFR "PDF toolkit on non-printing pages", sad §7 build gate): the pure
// analysis behind scripts/check-pdf-chunks.ts. Reading .next from disk is the script's thin shell.
import { describe, expect, it } from 'vitest';
import {
  EDITOR_ROUTES,
  PDF_TOOLKIT_MARKERS,
  analyzePdfChunks,
  parseClientReferenceManifest,
} from '../../scripts/check-pdf-chunks';

const MARKER = PDF_TOOLKIT_MARKERS[0];
const toolkitChunk = `(()=>{var a="${MARKER}";})()`;
const plainChunk = '(()=>{var a=1;})()';

describe('analyzePdfChunks (T3)', () => {
  it('treats exactly the two editor routes as allowed', () => {
    expect([...EDITOR_ROUTES].sort()).toEqual(['/invoices/[id]/edit', '/invoices/new']);
  });

  it('flags a non-editor route whose initial chunk contains the toolkit', () => {
    const result = analyzePdfChunks({
      routeChunks: {
        '/dashboard': ['static/chunks/a.js', 'static/chunks/pdf.js'],
        '/invoices': ['static/chunks/a.js'],
      },
      chunkContents: {
        'static/chunks/a.js': plainChunk,
        'static/chunks/pdf.js': toolkitChunk,
      },
    });
    expect(result.offenders).toEqual([{ route: '/dashboard', chunk: 'static/chunks/pdf.js' }]);
  });

  it('passes when only the invoice editor routes carry the toolkit', () => {
    const result = analyzePdfChunks({
      routeChunks: {
        '/invoices/new': ['static/chunks/pdf.js'],
        '/invoices/[id]/edit': ['static/chunks/pdf.js'],
        '/dashboard': ['static/chunks/a.js'],
      },
      chunkContents: { 'static/chunks/a.js': plainChunk, 'static/chunks/pdf.js': toolkitChunk },
    });
    expect(result.offenders).toEqual([]);
  });

  it('never passes silently on an empty route list (manifest layout changed)', () => {
    expect(() => analyzePdfChunks({ routeChunks: {}, chunkContents: {} })).toThrow(
      /manifest not found/i
    );
  });
});

describe('parseClientReferenceManifest (T3)', () => {
  it('reads the route and the chunk list of every client module', () => {
    const source =
      'globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n' +
      'globalThis.__RSC_MANIFEST["/dashboard/page"] = ' +
      JSON.stringify({
        clientModules: {
          x: { id: 1, name: '*', chunks: ['/_next/static/chunks/a.js'], async: false },
          y: { id: 2, name: '*', chunks: ['/_next/static/chunks/b.js'], async: false },
        },
      }) +
      ';\n';
    const parsed = parseClientReferenceManifest(source);
    expect(parsed.route).toBe('/dashboard/page');
    expect([...parsed.chunks].sort()).toEqual([
      '/_next/static/chunks/a.js',
      '/_next/static/chunks/b.js',
    ]);
  });
});
