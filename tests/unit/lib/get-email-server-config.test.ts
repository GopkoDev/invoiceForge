// T10 (spec.md §5 AC-16, sad.md §8 SMTP transport) - mail goes only over verified TLS.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEmailServerConfig } from '@/lib/get-email-server-config';
import { fixtureCa, startSmtp } from '../../support/smtp-server';

const fixtures = path.resolve(__dirname, '../../support/fixtures/tls');

function setMailEnv(host: string, port: number) {
  vi.stubEnv('EMAIL_SERVER_HOST', host);
  vi.stubEnv('EMAIL_SERVER_PORT', String(port));
  vi.stubEnv('EMAIL_SERVER_USER', 'user');
  vi.stubEnv('EMAIL_SERVER_PASSWORD', 'pass');
}

afterEach(() => vi.unstubAllEnvs());

describe('getEmailServerConfig transport options', () => {
  it('port 465 uses implicit TLS with verified certificate for the host', () => {
    setMailEnv('smtp.example.com', 465);
    expect(getEmailServerConfig()).toMatchObject({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      requireTLS: false,
      tls: { rejectUnauthorized: true, servername: 'smtp.example.com' },
      auth: { user: 'user', pass: 'pass' },
    });
  });

  it('port 587 requires STARTTLS with verified certificate for the host', () => {
    setMailEnv('smtp.example.com', 587);
    expect(getEmailServerConfig()).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true, servername: 'smtp.example.com' },
    });
  });

  // T26 / review F-21: one pooled connection per instance, so a send does not pay the TCP + TLS
  // handshake every time and sent responses stay close to the floor.
  it('pools the SMTP connection', () => {
    setMailEnv('smtp.example.com', 587);
    expect(getEmailServerConfig()).toMatchObject({ pool: true });
  });

  // T34 / review R-10: a send the sign-in hook has given up on must never go out later, so the
  // pool does not re-queue a message whose connection closed mid-send (nodemailer's default is 5).
  it('never re-queues a message whose connection closed during the send', () => {
    setMailEnv('smtp.example.com', 587);
    expect(getEmailServerConfig()).toMatchObject({ maxRequeues: 0 });
  });

  it('throws naming the setting instead of returning undefined', () => {
    setMailEnv('smtp.example.com', 587);
    vi.stubEnv('EMAIL_SERVER_HOST', '');
    expect(() => getEmailServerConfig()).toThrow(/EMAIL_SERVER_HOST/);
  });
});

const message = {
  from: 'a@example.com',
  to: 'b@example.com',
  subject: 's',
  text: 'secret link',
};

const trustedCa = fixtureCa;

// Resolves with the error a send raises (or undefined when it succeeds); `trustCa` adds the
// fixture CA to the verified-TLS options, the one deviation from getEmailServerConfig().
// `keepOpenMs` keeps the pool open that long after the send settles, so a re-queued retry would
// still reach the server.
async function sendAgainst(
  smtp: { port: number },
  { trustCa = false, keepOpenMs = 0 }: { trustCa?: boolean; keepOpenMs?: number } = {}
) {
  setMailEnv('127.0.0.1', smtp.port);
  const config = getEmailServerConfig();
  const transport = nodemailer.createTransport({
    ...config,
    ...(trustCa ? { tls: { ...config.tls, ca: trustedCa } } : {}),
  } as never);
  try {
    await transport.sendMail(message);
    return undefined;
  } catch (error) {
    return error as NodeJS.ErrnoException;
  } finally {
    await new Promise((r) => setTimeout(r, keepOpenMs));
    transport.close();
  }
}

describe('transport refuses clear text and unverified certificates (AC-16)', () => {
  it('server without STARTTLS: send rejects and nothing is sent', async () => {
    const smtp = await startSmtp({ offerStartTls: false });
    const error = await sendAgainst(smtp);
    smtp.close();
    expect(error).toBeInstanceOf(Error);
    expect(smtp.state.gotData).toBe(false);
  });

  // T27 / F-24: the CA is trusted here, so a rejection can only come from the host-name check.
  // (A self-signed certificate fails on its untrusted CA before the name is ever compared.)
  // nodemailer overwrites the Node TLS error code with ESOCKET, so the Node code is asserted on
  // the handshake itself (same options as the transport) and the send on the error's own text.
  it('certificate from a trusted CA but not valid for the host name: the handshake fails with ERR_TLS_CERT_ALTNAME_INVALID', async () => {
    const server = tls.createServer({
      key: fs.readFileSync(path.join(fixtures, 'wrong-name-key.pem')),
      cert: fs.readFileSync(path.join(fixtures, 'wrong-name-cert.pem')),
    });
    server.on('tlsClientError', () => {});
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    setMailEnv('127.0.0.1', (server.address() as net.AddressInfo).port);
    const { host, port, tls: tlsOptions } = getEmailServerConfig();
    const error = await new Promise<NodeJS.ErrnoException>(
      (resolve, reject) => {
        const socket = tls.connect({
          host,
          port,
          ...tlsOptions,
          ca: trustedCa,
        });
        socket.on('secureConnect', () => reject(new Error('connected')));
        socket.on('error', resolve);
      }
    );
    server.close();
    expect(error.code).toBe('ERR_TLS_CERT_ALTNAME_INVALID');
  });

  it('certificate from a trusted CA but not valid for the host name: send rejects on the name and sends nothing', async () => {
    const smtp = await startSmtp({ certName: 'wrong-name' });
    const error = await sendAgainst(smtp, { trustCa: true });
    smtp.close();
    expect(error?.message).toMatch(/altnames/);
    expect(smtp.state.gotData).toBe(false);
  });

  it('control: the same trusted CA with a certificate valid for the host name sends', async () => {
    const smtp = await startSmtp({ certName: 'right-name' });
    const error = await sendAgainst(smtp, { trustCa: true });
    smtp.close();
    expect(error).toBeUndefined();
    expect(smtp.state.gotData).toBe(true);
  });

  // R-10: nodemailer's pool re-queues a message whose connection closed before the greeting and
  // sends it on a later connection, possibly after the sign-in hook gave up on it.
  it('R-10: a connection that closes before the greeting fails that send; the pool never retries it on a new connection', async () => {
    const smtp = await startSmtp({
      certName: 'right-name',
      dropFirstConnectionBeforeGreeting: true,
    });
    const error = await sendAgainst(smtp, { trustCa: true, keepOpenMs: 1000 });
    smtp.close();
    expect(error).toBeInstanceOf(Error);
    expect(smtp.state.connections).toBe(1);
    expect(smtp.state.delivered).toBe(0);
  });

  it('self-signed certificate from an untrusted CA: send rejects before any data', async () => {
    const smtp = await startSmtp();
    const error = await sendAgainst(smtp);
    smtp.close();
    expect(error?.message).toMatch(/self[- ]signed/);
    expect(smtp.state.gotData).toBe(false);
  });
});
