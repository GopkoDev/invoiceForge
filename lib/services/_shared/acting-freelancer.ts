import 'server-only';
import { resolveTimeZone } from '@/lib/services/_shared/time-zone';

declare const actingFreelancerBrand: unique symbol;

/** Who is acting and in which zone; only producible by the trusted factories (ADR-0001). */
export type ActingFreelancer = {
  readonly userId: string;
  readonly timeZone: string;
  readonly [actingFreelancerBrand]: true;
};

/** The single constructor: resolves the zone once and performs the only allowed cast. */
export async function createActingFreelancer(userId: string, rawZone?: string): Promise<ActingFreelancer> {
  const timeZone = await resolveTimeZone(rawZone);
  return { userId, timeZone } as ActingFreelancer;
}
