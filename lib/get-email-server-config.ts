import { requireSetting } from '@/lib/env/required-settings';

export interface EmailServerConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  tls: { rejectUnauthorized: true; servername: string };
  auth: { user: string; pass: string };
  pool: true;
}

// Mail only ever leaves over verified TLS (AC-16): implicit TLS on 465, mandatory STARTTLS
// elsewhere; the certificate must be valid for the configured host.
export const getEmailServerConfig = (): EmailServerConfig => {
  const host = requireSetting('EMAIL_SERVER_HOST');
  const port = Number(requireSetting('EMAIL_SERVER_PORT'));
  const user = requireSetting('EMAIL_SERVER_USER');
  const pass = requireSetting('EMAIL_SERVER_PASSWORD');

  return {
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    tls: { rejectUnauthorized: true, servername: host },
    auth: { user, pass },
    // F-21: reuse the TLS connection across sends, so a send rarely outlasts the response floor.
    pool: true,
  };
};
