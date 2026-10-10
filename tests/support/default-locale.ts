// Makes `locale` the runtime's default locale for one test (editor-ux T7, T35; AC-09): every
// locale-less Intl.NumberFormat / Intl.DateTimeFormat and Date / Number toLocale* call formats as
// `locale`, the way a device set to that language would. Only an explicit locale (lib/format's
// 'en-US') is immune. Undo with vi.unstubAllGlobals() and vi.restoreAllMocks().
import { vi } from 'vitest';

export const DEVICE_LOCALES = ['en-US', 'uk-UA', 'de-DE'] as const;

export const RealNumberFormat = Intl.NumberFormat;
export const RealDateTimeFormat = Intl.DateTimeFormat;

export function stubDefaultLocale(locale: string): void {
  const NF = function (l?: string | string[], o?: Intl.NumberFormatOptions) {
    return new RealNumberFormat(l ?? locale, o);
  } as unknown as typeof Intl.NumberFormat;
  const DTF = function (l?: string | string[], o?: Intl.DateTimeFormatOptions) {
    return new RealDateTimeFormat(l ?? locale, o);
  } as unknown as typeof Intl.DateTimeFormat;
  vi.stubGlobal('Intl', { ...Intl, NumberFormat: NF, DateTimeFormat: DTF });
  const dateLocale = Date.prototype.toLocaleDateString;
  const dateTimeLocale = Date.prototype.toLocaleString;
  const numLocale = Number.prototype.toLocaleString;
  vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
    this: Date,
    l?: Intl.LocalesArgument,
    o?: Intl.DateTimeFormatOptions,
  ) {
    return dateLocale.call(this, l ?? locale, o);
  });
  vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (
    this: Date,
    l?: Intl.LocalesArgument,
    o?: Intl.DateTimeFormatOptions,
  ) {
    return dateTimeLocale.call(this, l ?? locale, o);
  });
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
    this: number,
    l?: Intl.LocalesArgument,
    o?: Intl.NumberFormatOptions,
  ) {
    return numLocale.call(this, l ?? locale, o);
  });
}
