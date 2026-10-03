// T10 (spec.md §5 AC-16, sad.md §8 SMTP transport) - mail goes only over verified TLS.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEmailServerConfig } from '@/lib/get-email-server-config';

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

  it('throws naming the setting instead of returning undefined', () => {
    setMailEnv('smtp.example.com', 587);
    vi.stubEnv('EMAIL_SERVER_HOST', '');
    expect(() => getEmailServerConfig()).toThrow(/EMAIL_SERVER_HOST/);
  });
});

// Minimal SMTP server recording whether any message data was received.
function startSmtp(offerStartTls: boolean, certName = 'test') {
  const state = { gotData: false };
  const handle = (socket: net.Socket) => {
    socket.on('error', () => {});
    socket.write('220 test ESMTP\r\n');
    socket.on('data', (buf) => {
      for (const line of buf.toString().split('\r\n').filter(Boolean)) {
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) {
          socket.write(
            offerStartTls
              ? '250-test\r\n250 STARTTLS\r\n'
              : '250-test\r\n250 AUTH PLAIN LOGIN\r\n'
          );
        } else if (cmd === 'STARTTLS' && offerStartTls) {
          socket.write('220 go ahead\r\n');
          socket.removeAllListeners('data');
          const secure = new tls.TLSSocket(socket, {
            isServer: true,
            key: fs.readFileSync(path.join(fixtures, `${certName}-key.pem`)),
            cert: fs.readFileSync(path.join(fixtures, `${certName}-cert.pem`)),
          });
          secure.on('error', () => {});
          // After the handshake: just enough of the dialogue for a send to complete, so a
          // certificate that passes verification can be told from one that never connects.
          let inData = false;
          secure.on('data', (chunk) => {
            for (const l of chunk.toString().split('\r\n').filter(Boolean)) {
              const c = l.toUpperCase();
              if (inData) {
                if (l === '.') {
                  inData = false;
                  secure.write('250 queued\r\n');
                }
              } else if (c.startsWith('EHLO')) {
                secure.write('250-test\r\n250 AUTH PLAIN LOGIN\r\n');
              } else if (c.startsWith('AUTH')) {
                secure.write('235 ok\r\n');
              } else if (c === 'DATA') {
                inData = true;
                state.gotData = true;
                secure.write('354 go\r\n');
              } else if (c === 'QUIT') {
                secure.end('221 bye\r\n');
              } else {
                secure.write('250 ok\r\n');
              }
            }
          });
          return;
        } else if (
          cmd.startsWith('MAIL') ||
          cmd.startsWith('AUTH') ||
          cmd === 'DATA'
        ) {
          state.gotData = true;
          socket.write('250 ok\r\n');
        } else {
          socket.write('250 ok\r\n');
        }
      }
    });
  };
  const server = net.createServer(handle);
  return new Promise<{ port: number; state: typeof state; close: () => void }>(
    (resolve) =>
      server.listen(0, '127.0.0.1', () =>
        resolve({
          port: (server.address() as net.AddressInfo).port,
          state,
          close: () => server.close(),
        })
      )
  );
}

const message = {
  from: 'a@example.com',
  to: 'b@example.com',
  subject: 's',
  text: 'secret link',
};

const trustedCa = fs.readFileSync(path.join(fixtures, 'ca-cert.pem'));

// Resolves with the error a send raises (or undefined when it succeeds); `trustCa` adds the
// fixture CA to the verified-TLS options, the one deviation from getEmailServerConfig().
async function sendAgainst(
  smtp: { port: number },
  { trustCa = false }: { trustCa?: boolean } = {}
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
    transport.close();
  }
}

describe('transport refuses clear text and unverified certificates (AC-16)', () => {
  it('server without STARTTLS: send rejects and nothing is sent', async () => {
    const smtp = await startSmtp(false);
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
    const smtp = await startSmtp(true, 'wrong-name');
    const error = await sendAgainst(smtp, { trustCa: true });
    smtp.close();
    expect(error?.message).toMatch(/altnames/);
    expect(smtp.state.gotData).toBe(false);
  });

  it('control: the same trusted CA with a certificate valid for the host name sends', async () => {
    const smtp = await startSmtp(true, 'right-name');
    const error = await sendAgainst(smtp, { trustCa: true });
    smtp.close();
    expect(error).toBeUndefined();
    expect(smtp.state.gotData).toBe(true);
  });

  it('self-signed certificate from an untrusted CA: send rejects before any data', async () => {
    const smtp = await startSmtp(true);
    const error = await sendAgainst(smtp);
    smtp.close();
    expect(error?.message).toMatch(/self[- ]signed/);
    expect(smtp.state.gotData).toBe(false);
  });
});
