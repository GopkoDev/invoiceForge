// Rebuilds the old / new / diff / exact-diff PNGs of the four layout baselines (see README.md).
// Usage (repo root): node docs/features/editor-ux/_audit/T58-layout-baselines/build.mjs [oldRev=d40c9aa] [newRev=HEAD]
// Needs only what is already in node_modules: the pngjs that ships inside playwright-core.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..', '..');
const [oldRev = 'd40c9aa', newRev = 'HEAD'] = process.argv.slice(2);
const dir = 'tests/e2e/editor-layout.spec.ts-snapshots';
const names = [
  'editor-new-invoice-desktop-chromium-linux',
  'editor-new-invoice-phone-chromium-linux',
  'editor-existing-invoice-desktop-chromium-linux',
  'editor-existing-invoice-phone-chromium-linux',
];
const pnpmDir = join(root, 'node_modules/.pnpm');
const pc = readdirSync(pnpmDir).find((d) => d.startsWith('playwright-core@'));
const { PNG } = createRequire(import.meta.url)(
  join(pnpmDir, pc, 'node_modules/playwright-core/lib/utilsBundle.js'),
);
const show = (rev, n) =>
  execFileSync('git', ['show', `${rev}:${dir}/${n}.png`], { cwd: root, maxBuffer: 1 << 28 });

// pixelmatch's colour distance (YIQ), threshold 0.2 like Playwright's default; no anti-alias exclusion.
function delta(a, ai, b, bi) {
  const al = a[ai + 3] / 255, bl = b[bi + 3] / 255;
  const ch = (x, i, k, al_) => 255 + (x[i + k] - 255) * al_;
  const r1 = ch(a, ai, 0, al), g1 = ch(a, ai, 1, al), b1 = ch(a, ai, 2, al);
  const r2 = ch(b, bi, 0, bl), g2 = ch(b, bi, 1, bl), b2 = ch(b, bi, 2, bl);
  const y = (r, g, bb) => r * 0.29889531 + g * 0.58662247 + bb * 0.11448223;
  const i = (r, g, bb) => r * 0.59597799 - g * 0.2741761 - bb * 0.32180189;
  const q = (r, g, bb) => r * 0.21147017 - g * 0.52261711 + bb * 0.31114694;
  const dy = y(r1, g1, b1) - y(r2, g2, b2), di = i(r1, g1, b1) - i(r2, g2, b2), dq = q(r1, g1, b1) - q(r2, g2, b2);
  return 0.5053 * dy * dy + 0.299 * di * di + 0.1957 * dq * dq;
}
const maxDelta = 35215 * 0.2 * 0.2;

const out = [];
for (const n of names) {
  const oBuf = show(oldRev, n), nBuf = show(newRev, n);
  writeFileSync(join(here, `${n}.old.png`), oBuf);
  writeFileSync(join(here, `${n}.new.png`), nBuf);
  const o = PNG.sync.read(oBuf), w = PNG.sync.read(nBuf);
  const W = Math.max(o.width, w.width), H = Math.max(o.height, w.height);
  const diff = new PNG({ width: W, height: H });
  const exact = new PNG({ width: W, height: H });
  let bad = 0, exactBad = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const inO = x < o.width && y < o.height, inN = x < w.width && y < w.height;
      let differs, differsExact;
      if (inO && inN) {
        const oi = (y * o.width + x) * 4, ni = (y * w.width + x) * 4;
        differs = delta(o.data, oi, w.data, ni) > maxDelta;
        differsExact = [0, 1, 2, 3].some((k) => o.data[oi + k] !== w.data[ni + k]);
      } else differs = differsExact = true;
      const g = inN ? Math.round(255 - (255 - w.data[(y * w.width + x) * 4 + 1]) * 0.25) : 255;
      if (differsExact) {
        exactBad++;
        exact.data.set([255, 0, 0, 255], p);
      } else exact.data.set([g, g, g, 255], p);
      if (differs) {
        bad++;
        diff.data.set([255, 0, 0, 255], p);
      } else diff.data.set([g, g, g, 255], p);
    }
  writeFileSync(join(here, `${n}.diff.png`), PNG.sync.write(diff));
  writeFileSync(join(here, `${n}.exact-diff.png`), PNG.sync.write(exact));
  const pct = (k) => ((k / (W * H)) * 100).toFixed(2);
  const line = `${n}: old ${o.width}x${o.height}, new ${w.width}x${w.height}, ${pct(bad)}% of pixels differ at threshold 0.2 (${bad} of ${W * H}), ${pct(exactBad)}% exactly (${exactBad})`;
  console.log(line);
  out.push(line);
}
mkdirSync(here, { recursive: true });
writeFileSync(join(here, 'percentages.txt'), out.join('\n') + '\n');
