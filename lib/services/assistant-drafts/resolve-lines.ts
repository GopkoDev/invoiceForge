// T16 (ai-assistant; spec.md §5 AC-16, AC-16b, AC-19, AC-22): resolves each requested line. Quantity,
// unit and price come from the Freelancer's words, the catalogue, the Customer's custom price or a
// named default - anything else becomes a DraftIssue, never a value of the resolver's own.
import 'server-only';
import { prisma } from '@/prisma';
import { lineAmount } from '@/lib/helpers/invoice-calculations';
import { foldName } from '@/lib/helpers/fold-name';
import type {
  DraftIssue,
  DraftProposal,
  DraftProposalLine,
  DraftRequest,
} from '@/lib/services/assistant-drafts/schema';

type Currency = DraftProposal['currency'];
type ProductRow = { id: string; name: string; unit: string; price: string; currency: Currency };

export type LineContext = { userId: string; currency?: Currency; customerId?: string };
export type ResolvedLine = Omit<DraftProposalLine, 'amount'>;

const money = (v: string | number) => lineAmount(v, '1');

type One = { line: ResolvedLine } | { issue: DraftIssue };

function pickProduct(
  matches: ProductRow[],
  needle: string,
): { product?: ProductRow; ambiguous: boolean } {
  if (matches.length === 1) return { product: matches[0], ambiguous: false };
  const exact = matches.filter((p) => foldName(p.name) === needle);
  if (exact.length === 1) return { product: exact[0], ambiguous: false };
  return { ambiguous: matches.length > 1 };
}

/** The products a line names: the one its productId gives (spec.md §1, an external Assistant), or by name. */
function productsNamed(
  line: DraftRequest['lines'][number],
  products: ProductRow[],
): ProductRow[] | 'NOT_FOUND' {
  if (line.productId !== undefined) {
    const byId = products.find((p) => p.id === line.productId);
    return byId ? [byId] : 'NOT_FOUND';
  }
  const needle = foldName(line.description);
  return products.filter((p) => foldName(p.name).includes(needle));
}

function resolveOne(
  index: number,
  line: DraftRequest['lines'][number],
  products: ProductRow[],
  customPrices: Map<string, string>,
  ctx: LineContext,
): One {
  const matches = productsNamed(line, products);
  if (matches === 'NOT_FOUND') {
    return { issue: { kind: 'PRODUCT_NOT_FOUND', lineIndex: index, written: line.productId as string } };
  }
  // A product in another currency is never linked (AC-16b); with no known currency none is excluded.
  const sameCurrency = matches.filter((p) => ctx.currency === undefined || p.currency === ctx.currency);
  const { product, ambiguous } = pickProduct(sameCurrency, foldName(line.description));
  const named = line.price !== undefined;

  // Several products match: the Freelancer is asked which one, never a pick (spec.md §1, R-11).
  if (ambiguous) {
    return {
      issue: {
        kind: 'PRODUCT_AMBIGUOUS',
        lineIndex: index,
        written: line.description,
        candidates: sameCurrency.slice(0, 50).map((p) => ({ productId: p.id, name: { freelancerText: p.name } })),
      },
    };
  }
  if (!product && !named) {
    if (matches.length > 0 && ctx.currency !== undefined) {
      return {
        issue: {
          kind: 'LINE_PRICE_MISSING_IN_CURRENCY',
          lineIndex: index,
          currency: ctx.currency,
          products: matches
            .slice(0, 50)
            .map((p) => ({ productId: p.id, name: { freelancerText: p.name }, currency: p.currency })),
        },
      };
    }
    return { issue: { kind: 'LINE_AMOUNT_MISSING', lineIndex: index, description: line.description } };
  }
  // Quantity 1 is the default only for a line that names an amount (spec.md §1 defaults, R-10).
  if (line.quantity === undefined && !named) {
    return { issue: { kind: 'LINE_QUANTITY_MISSING', lineIndex: index, description: line.description } };
  }

  const custom = product ? customPrices.get(product.id) : undefined;
  const rate = named
    ? { value: money(line.price as string), source: 'REQUEST' as const }
    : custom !== undefined
      ? { value: money(custom), source: 'CUSTOM_PRICE' as const }
      : { value: money((product as ProductRow).price), source: 'CATALOGUE' as const };

  const unit =
    line.unit !== undefined
      ? { value: line.unit, source: 'REQUEST' as const }
      : product
        ? { value: product.unit, source: 'CATALOGUE' as const }
        : { value: 'item', source: 'DEFAULT' as const };
  const quantity =
    line.quantity !== undefined
      ? { value: money(line.quantity), source: 'REQUEST' as const }
      : { value: '1.00', source: 'DEFAULT' as const };

  return {
    line: {
      name: product ? product.name : line.description,
      productId: product ? product.id : null,
      quantity: quantity.value,
      unit: unit.value,
      rate: rate.value,
      quantitySource: quantity.source,
      unitSource: unit.source,
      rateSource: rate.source,
      ...(named && custom !== undefined ? { agreedCustomPrice: money(custom) } : {}),
    },
  };
}

export async function resolveLines(
  request: DraftRequest,
  ctx: LineContext,
): Promise<{ lines: ResolvedLine[]; issues: DraftIssue[] }> {
  const rows = await prisma.product.findMany({
    where: { userId: ctx.userId, isActive: true },
    select: { id: true, name: true, unit: true, price: true, currency: true },
    orderBy: { name: 'asc' },
  });
  const products: ProductRow[] = rows.map((p) => ({ ...p, price: p.price.toString() }));
  const customPrices = new Map<string, string>();
  if (ctx.customerId !== undefined) {
    const found = await prisma.customPrice.findMany({
      where: { customerId: ctx.customerId, product: { userId: ctx.userId } },
      select: { productId: true, price: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const c of found) customPrices.set(c.productId, c.price.toString());
  }

  const lines: ResolvedLine[] = [];
  const issues: DraftIssue[] = [];
  request.lines.forEach((line, i) => {
    const one = resolveOne(i, line, products, customPrices, ctx);
    if ('issue' in one) issues.push(one.issue);
    else lines.push(one.line);
  });
  return { lines, issues };
}
