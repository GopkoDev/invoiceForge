// AC-07..AC-10 (ADR-0004): the shared five-year Dashboard period rule, one pure, dependency-free
// module applied by the link reader and the business layer.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_PERIOD_YEARS,
  PERIOD_TOO_LONG,
  addCalendarYears,
  isWithinMaxCustomPeriod,
  presetPeriodDays,
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

describe('presetPeriodDays (AC-22, AC-23)', () => {
  it.each([
    ['this-month', '2026-02-10', '2026-02-01', '2026-02-28'],
    ['this-month', '2028-02-10', '2028-02-01', '2028-02-29'],
    ['last-month', '2026-01-31', '2025-12-01', '2025-12-31'],
    ['next-month', '2026-12-31', '2027-01-01', '2027-01-31'],
    ['next-month', '2026-01-31', '2026-02-01', '2026-02-28'],
    ['this-year', '2026-06-15', '2026-01-01', '2026-12-31'],
    ['last-year', '2026-06-15', '2025-01-01', '2025-12-31'],
  ] as const)('%s on %s is %s..%s', (preset, today, from, to) => {
    expect(presetPeriodDays(preset, today)).toEqual({ from, to });
  });
});

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

describe('PRESET_PERIOD_NAMES (T42 review)', () => {
  it('is the single list of named presets: every name resolves to days and is recognised', async () => {
    const { PRESET_PERIOD_NAMES, isPresetPeriodName } = await import(
      '@/lib/validations/dashboard-period'
    );
    expect([...PRESET_PERIOD_NAMES].sort()).toEqual(
      ['last-month', 'last-year', 'next-month', 'this-month', 'this-year']
    );
    for (const name of PRESET_PERIOD_NAMES) {
      expect(isPresetPeriodName(name)).toBe(true);
      expect(presetPeriodDays(name, '2026-10-05').from).toMatch(/^\d{4}-\d{2}-01$/);
    }
    expect(isPresetPeriodName('all-time')).toBe(false);
    expect(isPresetPeriodName(undefined)).toBe(false);
  });
});
