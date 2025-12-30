export const authRoutes = {
  signIn: '/login',
  verifyRequest: '/verify-request',
  error: '/error',
};

export const protectedRoutes = {
  dashboard: '/dashboard',
  invoices: '/invoices',
  settings: '/settings',
};

export const publicRoutes = {
  landing: '/',
};

export const protectedRoutesArray = [...Object.values(protectedRoutes)];
export const publicRoutesArray = [...Object.values(publicRoutes)];
export const authRoutesArray = [...Object.values(authRoutes)];

export const routes = {
  public: publicRoutesArray,
  protected: protectedRoutesArray,
  auth: authRoutesArray,
};
