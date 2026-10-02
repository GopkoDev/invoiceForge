// Test scaffold (T3): builds an ActingFreelancer from raw values without a request.
// Built on the internal `createActingFreelancer` in lib/services/_shared/acting-freelancer.ts.
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { createActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

export async function actingFreelancerForTest(userId: string, timeZone?: string): Promise<ActingFreelancer> {
  return createActingFreelancer(userId, timeZone);
}
