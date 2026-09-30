// The one route the e2e route sweep leaves out: next-auth's catch-all handler owns many public
// endpoints (config/routes.config.ts lists them explicitly), so a fake segment under it says
// nothing. Every other catch-all stays in the sweep (review-2026-09-30 R-12). Kept in its own
// module, free of Playwright imports, so a unit test can run it on every PR (S-09).
export type BuiltRoute = { entry: string; urlPath: string; kind: 'page' | 'route' };

export const NEXTAUTH_CATCH_ALL = '/api/auth/[...nextauth]';

export const isNextAuthCatchAll = (route: BuiltRoute): boolean =>
  route.urlPath === NEXTAUTH_CATCH_ALL;
