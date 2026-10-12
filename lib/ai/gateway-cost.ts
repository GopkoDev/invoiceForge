// R-16 (ai-assistant; spec §6 cost NFR; data-model.md AssistantTurn.costUsd): the USD cost the AI Gateway
// reports for one model call, in its provider metadata (`gateway.cost`, a decimal string). A call it reports
// no cost for, as on the free-tier key (ADR-0003), costs 0.
export function gatewayCostOf(providerMetadata: unknown): number {
  const gateway = (providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway;
  const cost = typeof gateway?.cost === 'string' ? Number(gateway.cost) : gateway?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : 0;
}

/** The sum of call costs, rounded to the six decimals AssistantTurn.costUsd keeps. */
export function sumCosts(costs: number[]): number {
  return Math.round(costs.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
}
