export type PersonalKeySummary = {
  id: string;
  name: string;
  createdAt: string;
  lastFour: string;
  lastUsedAt: string | null;
};
export type RevokedPersonalKeySummary = PersonalKeySummary & { revokedAt: string };
export type PersonalKeyList = {
  active: PersonalKeySummary[];
  revoked: RevokedPersonalKeySummary[];
};
