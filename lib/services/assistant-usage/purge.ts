// T14 (ai-assistant; spec.md §5 AC-38): the daily retention sweeps for assistant usage data — repeat marks
// (24 h), Mastra traces (30 days) and Assistant turns / allowance days / key-draft days (400 days).
import 'server-only';
import { PostgresStore } from '@mastra/pg';
import { prisma } from '@/prisma';
import { MASTRA_SCHEMA } from '@/lib/ai/mastra';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const TRACE_RETENTION_DAYS = 30;
export const COUNTER_RETENTION_DAYS = 400;
const TRACE_BATCH = 100;
const MAX_TRACE_BATCHES = 1000;

/** Deletes duplicate-draft repeat marks older than 24 h. */
export async function purgeRepeatMarks(now: Date): Promise<number> {
  const { count } = await prisma.mcpDraftRepeat.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 24 * HOUR_MS) } },
  });
  return count;
}

/** Deletes turns, allowance days and key-draft days past 400 days; returns the three counts added together. */
export async function purgeTurnsAndCounters(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - COUNTER_RETENTION_DAYS * DAY_MS);
  // Day rows are stored as the local day at 00:00 UTC; "today" is now cut to that.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayCutoff = new Date(today - COUNTER_RETENTION_DAYS * DAY_MS);
  const [turns, allowance, keyDays] = await prisma.$transaction([
    prisma.assistantTurn.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.messageAllowanceDay.deleteMany({ where: { day: { lt: dayCutoff } } }),
    prisma.personalKeyDraftDay.deleteMany({ where: { day: { lt: dayCutoff } } }),
  ]);
  return turns.count + allowance.count + keyDays.count;
}

let store: PostgresStore | undefined;
function traceStore(): PostgresStore {
  store ??= new PostgresStore({
    id: 'mastra-purge',
    connectionString: process.env.DATABASE_URL ?? '',
    schemaName: MASTRA_SCHEMA,
    disableInit: true,
  });
  return store;
}

/** Deletes Mastra traces that started more than 30 days ago; returns the number of traces removed. */
export async function purgeTraces(now: Date): Promise<number> {
  const obs = await traceStore().getStore('observability');
  if (!obs) throw new Error('Observability storage unavailable');
  const end = new Date(now.getTime() - TRACE_RETENTION_DAYS * DAY_MS);
  let deleted = 0;
  for (let i = 0; i < MAX_TRACE_BATCHES; i++) {
    const { spans } = await obs.listTraces({
      filters: { startedAt: { end, endExclusive: true } },
      pagination: { page: 0, perPage: TRACE_BATCH },
    });
    const traceIds = [...new Set(spans.map((s) => s.traceId))];
    if (traceIds.length === 0) break;
    await obs.batchDeleteTraces({ traceIds });
    deleted += traceIds.length;
  }
  return deleted;
}
