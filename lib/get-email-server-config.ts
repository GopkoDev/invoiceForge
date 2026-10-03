import { requireSetting } from '@/lib/env/required-settings';

export interface EmailServerConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  tls: { rejectUnauthorized: true; servername: string };
  auth: { user: string; pass: string };
  pool: true;
  maxRequeues: 0;
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
    // F-21: reuse the TLS connection for sends that follow each other closely on one instance
    // (an idle pooled connection closes after the 10 s socket timeout; sad.md response floor).
    pool: true,
    // R-10: never re-queue a message whose connection closed (nodemailer's default is 5): the
    // sign-in hook may have given up on it and released its reservation, so a later delivery
    // would be a sent link the address limit never counted.
    maxRequeues: 0,
  };
};
