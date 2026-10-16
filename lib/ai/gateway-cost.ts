// R-16 (ai-assistant; spec §6 cost NFR; data-model.md AssistantTurn.costUsd): the USD cost the AI Gateway
// reports for one model call, in its provider metadata (`gateway.cost`, a decimal string). On paid terms
// (ai-chat-v2 ADR-0014) a call with no reported cost is unknown, never free: it returns null, and a reported
// "0" stays 0.
export function gatewayCostOf(providerMetadata: unknown): number | null {
  const gateway = (providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway;
  const cost = typeof gateway?.cost === 'string' ? (gateway.cost.trim() === '' ? NaN : Number(gateway.cost)) : gateway?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null;
}

/** The sum of call costs, rounded to the six decimals AssistantTurn.costUsd keeps; null when any call's cost is unknown. */
export function sumCosts(costs: (number | null)[]): number | null {
  let total = 0;
  for (const cost of costs) {
    if (cost === null) return null;
    total += cost;
  }
  return Math.round(total * 1e6) / 1e6;
}
