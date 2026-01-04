export const authRoutes = {
  signIn: '/login',
  verifyRequest: '/verify-request',
  error: '/error',
} as const;

const protectedRoutesBase = {
  dashboard: '/dashboard',
  invoices: '/invoices',
  senderProfiles: '/sender-profiles',
  customers: '/customers',
  settings: '/settings',
} as const;

export const protectedRoutes = {
  ...protectedRoutesBase,

  settingsProfile: '/settings/profile',

  senderProfilesNew: `${protectedRoutesBase.senderProfiles}/new`,
  senderProfileDetail: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}` as const,
  senderProfileEdit: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}/edit` as const,
  senderProfileEditTab: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}/edit/profile` as const,
  senderProfileEditBankAccounts: (id: string) =>
    `${protectedRoutesBase.senderProfiles}/${id}/edit/bank-accounts` as const,

  customersNew: `${protectedRoutesBase.customers}/new`,
  customerDetail: (id: string) =>
    `${protectedRoutesBase.customers}/${id}` as const,
  customerEdit: (id: string) =>
    `${protectedRoutesBase.customers}/${id}/edit` as const,
} as const;

export const publicRoutes = {
  landing: '/',
} as const;

export const protectedRoutesArray = [
  ...Object.values(protectedRoutesBase),
] as const;

export const publicRoutesArray = [...Object.values(publicRoutes)] as const;

export const authRoutesArray = [...Object.values(authRoutes)] as const;

export const routes = {
  public: publicRoutesArray,
  protected: protectedRoutesArray,
  auth: authRoutesArray,
} as const;
