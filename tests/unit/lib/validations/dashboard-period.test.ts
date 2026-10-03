// T6 (spec.md §5 AC-07, AC-08, AC-09, AC-10) — the shared five-year Dashboard period rule
// (ADR-0004): one pure, dependency-free module, applied by the link reader and the business layer.
// RED: lib/validations/dashboard-period.ts does not exist yet.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_PERIOD_YEARS,
  PERIOD_TOO_LONG,
  addCalendarYears,
  isWithinMaxCustomPeriod,
} from '@/lib/validations/dashboard-period';

const originalTZ = process.env.TZ;
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

const BOUNDARY: [string, string, boolean][] = [
  ['2021-01-01', '2026-01-01', true],
  ['2021-01-01', '2026-01-02', false],
  ['2020-02-29', '2025-02-28', true],
  ['2020-02-29', '2025-03-01', false],
  ['2021-01-01', '2021-01-01', true],
  ['0100-01-01', '9999-12-31', false],
  ['2026-02-02', '2026-02-01', false], // inverted
  ['abc', '2026-01-01', false], // malformed
  ['2021-01-01', '2026-02-30', false], // not a real date
];

describe('dashboard-period constants', () => {
  it('exposes the contract constants', () => {
    expect(MAX_CUSTOM_PERIOD_YEARS).toBe(5);
    expect(PERIOD_TOO_LONG).toBe(
      'A custom period can be at most 5 years. Choose "All time" to see your full history.'
    );
  });

  it('addCalendarYears moves a 29 February start to 28 February', () => {
    expect(addCalendarYears('2020-02-29', 5)).toBe('2025-02-28');
    expect(addCalendarYears('2021-01-01', 5)).toBe('2026-01-01');
  });
});

describe.each(['Pacific/Kiritimati', 'Etc/GMT+12', 'UTC'])(
  'isWithinMaxCustomPeriod under TZ=%s (AC-08)',
  (tz) => {
    it.each(BOUNDARY)('%s -> %s is %s', (from, to, expected) => {
      process.env.TZ = tz;
      expect(isWithinMaxCustomPeriod(from, to)).toBe(expected);
    });
  }
);

describe('dashboard-period module is dependency-free (ADR-0004)', () => {
  it('imports nothing and has no server/browser dependencies', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/validations/dashboard-period.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/from\s+['"]/);
    expect(src).not.toMatch(/server-only|next\/|node:|['"]react['"]/);
  });
});
