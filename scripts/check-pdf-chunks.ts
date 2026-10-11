// editor-ux T3 (spec §6 "PDF toolkit on non-printing pages", sad §7 build gate): after `next build`,
// fail when any route other than the invoice editor lists a chunk holding @react-pdf/renderer
// among its client chunks. Run: `pnpm check:pdf-chunks` (needs a finished `.next` build).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Strings that appear in the built toolkit chunk (pdfkit and yoga sources) and nowhere else. */
export const PDF_TOOLKIT_MARKERS: readonly string[] = [
  'react-pdf/react-pdf/packages/pdfkit',
  'yoga-layout@',
  'sRGB_IEC61966',
];

/** The only routes allowed to carry the toolkit (the editor shows a live preview from first display). */
export const EDITOR_ROUTES = ['/invoices/[id]/edit', '/invoices/new'] as const;

export type Offender = { route: string; chunk: string };

export function analyzePdfChunks(input: {
  routeChunks: Record<string, string[]>;
  chunkContents: Record<string, string>;
}): { offenders: Offender[] } {
  const routes = Object.keys(input.routeChunks);
  if (routes.length === 0) {
    throw new Error('client reference manifest not found: no routes to check');
  }
  const allowed = new Set<string>(EDITOR_ROUTES);
  const offenders: Offender[] = [];
  for (const route of routes) {
    if (allowed.has(route)) continue;
    for (const chunk of input.routeChunks[route]) {
      const body = input.chunkContents[chunk] ?? '';
      if (PDF_TOOLKIT_MARKERS.some((m) => body.includes(m))) offenders.push({ route, chunk });
    }
  }
  return { offenders };
}

export function parseClientReferenceManifest(source: string): { route: string; chunks: string[] } {
  const match = /__RSC_MANIFEST\["([^"]+)"\]\s*=\s*/.exec(source);
  if (!match) throw new Error('client reference manifest not found: unrecognised layout');
  const json = source.slice(match.index + match[0].length).replace(/;\s*$/, '');
  const manifest = JSON.parse(json) as {
    clientModules?: Record<string, { chunks?: string[] }>;
  };
  const chunks = new Set<string>();
  for (const mod of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) chunks.add(chunk);
  }
  return { route: match[1], chunks: [...chunks] };
}

function findManifests(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findManifests(full);
    return entry.name === 'page_client-reference-manifest.js' ? [full] : [];
  });
}

/** `/(protected)/dashboard/page` -> `/dashboard` through Next's own map, groups stripped as fallback. */
function toRoutePath(key: string, appPathRoutes: Record<string, string>): string {
  if (appPathRoutes[key]) return appPathRoutes[key];
  const stripped = key.replace(/\/\([^/]+\)/g, '').replace(/\/page$/, '');
  return stripped === '' ? '/' : stripped;
}

function readStaticChunks(distDir: string): string[] {
  const dir = path.join(distDir, 'static', 'chunks');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => fs.readFileSync(path.join(dir, e.name), 'utf8'));
}

function chunkPath(distDir: string, chunk: string): string {
  return path.join(distDir, chunk.replace(/^\/_next\//, ''));
}

export function runPdfChunkCheck(distDir: string): number {
  const appDir = path.join(distDir, 'server', 'app');
  const routesFile = path.join(distDir, 'app-path-routes-manifest.json');
  const manifests = findManifests(appDir);
  if (manifests.length === 0 || !fs.existsSync(routesFile)) {
    console.error(`check-pdf-chunks: manifest not found under ${distDir} (run next build first)`);
    return 1;
  }
  const appPathRoutes = JSON.parse(fs.readFileSync(routesFile, 'utf8')) as Record<string, string>;
  const routeChunks: Record<string, string[]> = {};
  const chunkContents: Record<string, string> = {};
  for (const file of manifests) {
    const { route, chunks } = parseClientReferenceManifest(fs.readFileSync(file, 'utf8'));
    const files = chunks.filter((c) => c.endsWith('.js'));
    routeChunks[toRoutePath(route, appPathRoutes)] = files;
    for (const chunk of files) {
      if (chunk in chunkContents) continue;
      const onDisk = chunkPath(distDir, chunk);
      chunkContents[chunk] = fs.existsSync(onDisk) ? fs.readFileSync(onDisk, 'utf8') : '';
    }
  }
  const missing = Object.keys(chunkContents).filter((c) => !fs.existsSync(chunkPath(distDir, c)));
  if (missing.length > 0) {
    console.error('check-pdf-chunks: chunks listed in a manifest are missing on disk:');
    for (const c of missing) console.error(`  ${c}`);
    return 1;
  }
  // The toolkit is lazy-loaded, so it lives outside every route's initial chunks: scan the whole
  // static chunk directory, not just the manifest-listed files.
  const allBodies = [...Object.values(chunkContents), ...readStaticChunks(distDir)];
  if (!allBodies.some((b) => PDF_TOOLKIT_MARKERS.some((m) => b.includes(m)))) {
    console.error(
      'check-pdf-chunks: positive control: no chunk contains the PDF toolkit (markers are stale or the build is wrong)'
    );
    return 1;
  }
  const { offenders } = analyzePdfChunks({ routeChunks, chunkContents });
  if (offenders.length > 0) {
    console.error('check-pdf-chunks: the PDF toolkit is in the initial chunks of:');
    for (const o of offenders) console.error(`  ${o.route}  <-  ${o.chunk}`);
    return 1;
  }
  console.log(`check-pdf-chunks: ${Object.keys(routeChunks).length} routes checked, no toolkit leak`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runPdfChunkCheck(path.resolve('.next')));
}
