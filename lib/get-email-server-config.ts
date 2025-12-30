interface EmailServerConfig {
  host: string;
  port: number;
  auth: { user: string; pass: string };
}

export const getEmailServerConfig = (): EmailServerConfig | undefined => {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = process.env.EMAIL_SERVER_PORT
    ? Number(process.env.EMAIL_SERVER_PORT)
    : undefined;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;

  if (!host || !port || !user || !pass) return undefined;

  return {
    host,
    port,
    auth: { user, pass },
  };
};
