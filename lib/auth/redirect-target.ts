// Auth.js's redirect callback: where the browser goes after sign-in. Only this app is ever the
// target. The app is known by the origin the request arrived on (`baseUrl`) and by the configured
// public origin (`AUTH_URL`); the two differ when the server sees itself under another host name,
// and a Sign-in link built from AUTH_URL must still return to the page it was asked for (AC-19).
export function authRedirectTarget(
  url: string,
  baseUrl: string,
  authUrl: string | undefined
): string {
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  try {
    const origin = new URL(url).origin;
    if (origin === baseUrl) return url;
    if (authUrl && origin === new URL(authUrl).origin) return url;
  } catch {
    // Not an address: fall through to the base origin.
  }
  return baseUrl;
}
