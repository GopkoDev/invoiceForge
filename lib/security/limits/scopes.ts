// Per-scope limit configuration.
import type { LimitOutcome, LimitScope } from '@prisma/client';

export interface LimitScopeConfig {
  windowMs: number;
  max: number;
  countedOutcomes: LimitOutcome[];
}

const MIN = 60_000;

export const LIMIT_SCOPES: Record<
  'SIGNIN_SOURCE' | 'SIGNIN_ADDRESS' | 'EXPORT' | 'MCP_KEY' | 'MCP_SOURCE',
  LimitScopeConfig
> = {
  SIGNIN_SOURCE: { windowMs: 5 * MIN, max: 30, countedOutcomes: ['REQUESTED'] },
  SIGNIN_ADDRESS: { windowMs: 60 * MIN, max: 5, countedOutcomes: ['SENT'] },
  EXPORT: { windowMs: 60 * MIN, max: 3, countedOutcomes: ['STARTED'] },
  // Assistant (MCP) calls: 60 key-checked calls per minute per Personal key; a source is
  // blocked after 30 refused key checks in 5 minutes.
  MCP_KEY: { windowMs: MIN, max: 60, countedOutcomes: ['REQUESTED'] },
  MCP_SOURCE: { windowMs: 5 * MIN, max: 30, countedOutcomes: ['REFUSED'] },
};

export function scopeConfig(scope: LimitScope): LimitScopeConfig {
  const config = (LIMIT_SCOPES as Record<string, LimitScopeConfig | undefined>)[
    scope
  ];
  if (!config) throw new Error(`No limit configuration for scope ${scope}`);
  return config;
}
