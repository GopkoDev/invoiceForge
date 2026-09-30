// F-26: app/layout.tsx's metadata.icons referenced /icon-192.png and /icon-512.png, which do
// not exist anywhere under app/ or public/ (the real files are app/icon.png, app/apple-icon.png,
// app/favicon.ico and app/icon.svg, plus the manifest's web-app-manifest-*.png). Read the source
// directly rather than importing the module: app/layout.tsx pulls in next/font/google, which
// only works inside Next's own build, not a plain vitest import.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const layoutSource = fs.readFileSync(
  path.join(process.cwd(), 'app/layout.tsx'),
  'utf8'
);

describe('root layout icons metadata (F-26)', () => {
  it('does not reference the dead /icon-192.png and /icon-512.png files', () => {
    expect(layoutSource).not.toMatch(/icon-192\.png/);
    expect(layoutSource).not.toMatch(/icon-512\.png/);
  });
});
