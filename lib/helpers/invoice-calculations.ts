// Pure, exact-decimal invoice math (ADR-0006). No Prisma, no server imports: this module ships
// in the browser bundle and is the single source of truth for editor and server amounts.
//
// Inputs/outputs are decimal strings ("120.00") or plain numbers that represent decimal values
// exactly as typed (never the result of a float multiply/divide). Internally everything is done
// on BigInt so no float rounding artefacts (0.1 + 0.2, 2.675 * 100, ...) can leak in.

export type DecimalString = string;

interface Scaled {
  unscaled: bigint;
  scale: number;
}

// F-07: Number#toString() renders very small/large numbers in exponent form (e.g. (1e-7)
// .toString() === "1e-7"), which BigInt(...) can't parse. Expand the mantissa/exponent into a
// plain decimal string ourselves (no re-parsing through a float) before the digit split below.
function expandExponent(raw: string): string {
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
  if (!match) return raw;

  const [, sign, intPart, fracPart = '', expPart] = match;
  const exp = parseInt(expPart, 10);
  const digits = intPart + fracPart;
  const pointPos = intPart.length + exp;

  if (pointPos <= 0) {
    return `${sign}0.${'0'.repeat(-pointPos)}${digits}`;
  }
  if (pointPos >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointPos - digits.length)}`;
  }
  return `${sign}${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
}

function parseDecimal(value: DecimalString | number): Scaled {
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  const normalized = /e/i.test(raw) ? expandExponent(raw) : raw;
  const negative = normalized.startsWith('-');
  const abs = negative ? normalized.slice(1) : normalized;
  const [intPart, fracPart = ''] = abs.split('.');
  const unscaledStr = `${intPart || '0'}${fracPart}` || '0';
  const unscaled = BigInt(unscaledStr) * BigInt(negative ? -1 : 1);
  return { unscaled, scale: fracPart.length };
}

function multiply(a: Scaled, b: Scaled): Scaled {
  return { unscaled: a.unscaled * b.unscaled, scale: a.scale + b.scale };
}

function add(a: Scaled, b: Scaled): Scaled {
  const scale = Math.max(a.scale, b.scale);
  const aUnscaled = a.unscaled * BigInt(10) ** BigInt(scale - a.scale);
  const bUnscaled = b.unscaled * BigInt(10) ** BigInt(scale - b.scale);
  return { unscaled: aUnscaled + bUnscaled, scale };
}

function subtract(a: Scaled, b: Scaled): Scaled {
  return add(a, { unscaled: -b.unscaled, scale: b.scale });
}

// Half rounds up (away from zero for the magnitude), matching ADR-0006's rounding rule.
function roundHalfUp(value: Scaled, targetScale: number): bigint {
  const { unscaled, scale } = value;
  if (scale <= targetScale) {
    return unscaled * BigInt(10) ** BigInt(targetScale - scale);
  }

  const factor = BigInt(10) ** BigInt(scale - targetScale);
  const negative = unscaled < BigInt(0);
  const abs = negative ? -unscaled : unscaled;
  const quotient = abs / factor;
  const remainder = abs % factor;
  const roundedAbs =
    remainder * BigInt(2) >= factor ? quotient + BigInt(1) : quotient;
  return negative ? -roundedAbs : roundedAbs;
}

function formatScaled(unscaled: bigint, scale: number): DecimalString {
  const negative = unscaled < BigInt(0);
  const abs = negative ? -unscaled : unscaled;
  const digits = abs.toString().padStart(scale + 1, '0');
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

function toCents(value: Scaled): bigint {
  return roundHalfUp(value, 2);
}

// F-04 (spec.md §3, "the entered value is never silently corrected"): the editor keeps a numeric
// field's raw, un-sanitized parse (e.g. Number('-') while a "-5" is still being typed), which can
// be NaN/Infinity for a moment. BigInt can't represent that, so every entry point below checks
// for it first and reports the whole result as "NaN" instead of throwing — honest, not silently
// rounded to 0.
function isInvalidNumber(value: DecimalString | number): boolean {
  return typeof value === 'number' && !Number.isFinite(value);
}

/** quantity x price, rounded half-up to cents. Exact for any input decimal precision. */
export function lineAmount(
  quantity: DecimalString | number,
  price: DecimalString | number
): DecimalString {
  if (isInvalidNumber(quantity) || isInvalidNumber(price)) return 'NaN';
  const product = multiply(parseDecimal(quantity), parseDecimal(price));
  return formatScaled(toCents(product), 2);
}

export interface InvoiceAmountItemInput {
  quantity: DecimalString | number;
  price: DecimalString | number;
}

export interface InvoiceAmountsInput {
  items: InvoiceAmountItemInput[];
  discount: DecimalString | number;
  shipping: DecimalString | number;
  taxRate: DecimalString | number;
}

export interface InvoiceAmountItemResult {
  amount: DecimalString;
}

export interface InvoiceAmounts {
  items: InvoiceAmountItemResult[];
  subtotal: DecimalString;
  taxAmount: DecimalString;
  total: DecimalString;
}

/**
 * Stored amounts come only from this function (ADR-0006):
 * item.amount = roundHalfUp(quantity x price, 2)
 * subtotal = sum(amount)
 * taxAmount = roundHalfUp((subtotal - discount + shipping) x taxRate / 100, 2)
 * total = subtotal - discount + shipping + taxAmount
 * Whatever the browser sent for totals is ignored; this is the only computation that counts.
 */
export function computeInvoiceAmounts(input: InvoiceAmountsInput): InvoiceAmounts {
  const hasInvalidInput =
    input.items.some((item) => isInvalidNumber(item.quantity) || isInvalidNumber(item.price)) ||
    isInvalidNumber(input.discount) ||
    isInvalidNumber(input.shipping) ||
    isInvalidNumber(input.taxRate);

  if (hasInvalidInput) {
    return {
      items: input.items.map(() => ({ amount: 'NaN' })),
      subtotal: 'NaN',
      taxAmount: 'NaN',
      total: 'NaN',
    };
  }

  const itemCents = input.items.map((item) =>
    toCents(multiply(parseDecimal(item.quantity), parseDecimal(item.price)))
  );

  const subtotalCents = itemCents.reduce(
    (sum, cents) => sum + cents,
    BigInt(0)
  );

  const discountCents = toCents(parseDecimal(input.discount));
  const shippingCents = toCents(parseDecimal(input.shipping));

  const taxBaseCents: Scaled = subtract(
    add({ unscaled: subtotalCents, scale: 2 }, { unscaled: shippingCents, scale: 2 }),
    { unscaled: discountCents, scale: 2 }
  );

  // taxRate is a percentage; dividing by 100 is the same as adding 2 to the result's scale.
  const taxRate = parseDecimal(input.taxRate);
  const taxAmountCents = toCents({
    unscaled: taxBaseCents.unscaled * taxRate.unscaled,
    scale: taxBaseCents.scale + taxRate.scale + 2,
  });

  const totalCents =
    subtotalCents - discountCents + shippingCents + taxAmountCents;

  return {
    items: itemCents.map((cents) => ({ amount: formatScaled(cents, 2) })),
    subtotal: formatScaled(subtotalCents, 2),
    taxAmount: formatScaled(taxAmountCents, 2),
    total: formatScaled(totalCents, 2),
  };
}

/** Thin number adapters for callers (editor display, legacy server helpers) that still work in
 * plain numbers. Never used to compute amounts directly — always fed from computeInvoiceAmounts. */
export function decimalStringToNumber(value: DecimalString): number {
  return Number(value);
}
