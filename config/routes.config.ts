export const authRoutes = {
  signIn: '/login',
  verifyRequest: '/verify-request',
  error: '/error',
} as const;

const protectedRoutesBase = {
  dashboard: '/dashboard',
  invoices: '/invoices',
  senderProfiles: '/sender-profiles',
  settings: '/settings',
} as const;

export const protectedRoutes = {
  ...protectedRoutesBase,

  settingsProfile: '/settings/profile',
  senderProfilesNew: '/sender-profiles/new',

  senderProfileEdit: (id: string) => `/sender-profiles/${id}/edit` as const,

  senderProfileEditTab: (id: string) =>
    `/sender-profiles/${id}/edit/profile` as const,

  senderProfileEditBankAccounts: (id: string) =>
    `/sender-profiles/${id}/edit/bank-accounts` as const,
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
