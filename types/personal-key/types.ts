export type DraftsToday = { created: number; allowance: number; lastLiftedAt: string | null };
export type CreatedPersonalKey = {
  id: string;
  name: string;
  createdAt: string;
  lastFour: string;
  canCreateDrafts: boolean;
  lastUsedAt: string | null;
};
// null for read-only keys (AC-27/AC-28).
export type PersonalKeySummary = CreatedPersonalKey & { draftsToday: DraftsToday | null };
export type RevokedPersonalKeySummary = CreatedPersonalKey & { revokedAt: string };
export type PersonalKeyList = {
  active: PersonalKeySummary[];
  revoked: RevokedPersonalKeySummary[];
};
