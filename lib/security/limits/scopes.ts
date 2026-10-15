// Per-scope limit configuration.
import type { LimitOutcome, LimitScope } from '@prisma/client';
import { CHAT_PER_MINUTE_MAX, CHAT_RATE_WINDOW_MS } from '@/lib/ai/limits';

export interface LimitScopeConfig {
  windowMs: number;
  max: number;
  countedOutcomes: LimitOutcome[];
}

const MIN = 60_000;

export const LIMIT_SCOPES: Record<
  'SIGNIN_SOURCE' | 'SIGNIN_ADDRESS' | 'EXPORT' | 'MCP_KEY' | 'MCP_SOURCE' | 'CHAT_MESSAGE',
  LimitScopeConfig
> = {
  SIGNIN_SOURCE: { windowMs: 5 * MIN, max: 30, countedOutcomes: ['REQUESTED'] },
  SIGNIN_ADDRESS: { windowMs: 60 * MIN, max: 5, countedOutcomes: ['SENT'] },
  EXPORT: { windowMs: 60 * MIN, max: 3, countedOutcomes: ['STARTED'] },
  // Assistant (MCP) calls: 60 key-checked calls per minute per Personal key; a source is
  // blocked after 30 refused key checks in 5 minutes.
  MCP_KEY: { windowMs: MIN, max: 60, countedOutcomes: ['REQUESTED'] },
  MCP_SOURCE: { windowMs: 5 * MIN, max: 30, countedOutcomes: ['REFUSED'] },
  // The chat's per-minute limit per Freelancer (key = user id); a refusal writes no row.
  CHAT_MESSAGE: {
    windowMs: CHAT_RATE_WINDOW_MS,
    max: CHAT_PER_MINUTE_MAX,
    countedOutcomes: ['REQUESTED'],
  },
};

export function scopeConfig(scope: LimitScope): LimitScopeConfig {
  const config = (LIMIT_SCOPES as Record<string, LimitScopeConfig | undefined>)[
    scope
  ];
  if (!config) throw new Error(`No limit configuration for scope ${scope}`);
  return config;
}
