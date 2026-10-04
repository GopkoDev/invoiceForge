// AC-20: the PDF renderer's fonts are served by the app itself, so the enforced
// CSP needs no third-party host for invoice PDF download and print.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDF_FONTS } from '@/config/pdf-config';

describe('PDF fonts are self-hosted (AC-20)', () => {
  it.each(Object.entries(PDF_FONTS.URLS))(
    '%s font is a same-origin path to a TrueType file in public/',
    (_, url) => {
      expect(url).toMatch(/^\/fonts\/[\w./-]+\.ttf$/);
      const file = join(process.cwd(), 'public', url);
      expect(existsSync(file), `${file} must exist`).toBe(true);
      // TrueType magic number 0x00010000
      expect(readFileSync(file).subarray(0, 4).toString('hex')).toBe(
        '00010000'
      );
    }
  );
});
