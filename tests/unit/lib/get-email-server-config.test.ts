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

  it('throws naming the setting instead of returning undefined', () => {
    setMailEnv('smtp.example.com', 587);
    vi.stubEnv('EMAIL_SERVER_HOST', '');
    expect(() => getEmailServerConfig()).toThrow(/EMAIL_SERVER_HOST/);
  });
});

// Minimal SMTP server recording whether any message data was received.
function startSmtp(offerStartTls: boolean) {
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
            key: fs.readFileSync(path.join(fixtures, 'test-key.pem')),
            cert: fs.readFileSync(path.join(fixtures, 'test-cert.pem')),
          });
          secure.on('error', () => {});
          secure.on('data', () => {
            state.gotData = true;
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

describe('transport refuses clear text and unverified certificates (AC-16)', () => {
  it('server without STARTTLS: send rejects and nothing is sent', async () => {
    const smtp = await startSmtp(false);
    setMailEnv('127.0.0.1', smtp.port);
    const transport = nodemailer.createTransport(
      getEmailServerConfig() as never
    );
    await expect(transport.sendMail(message)).rejects.toThrow();
    expect(smtp.state.gotData).toBe(false);
    smtp.close();
  });

  it('certificate not valid for the host name: send rejects', async () => {
    const smtp = await startSmtp(true);
    setMailEnv('127.0.0.1', smtp.port);
    const transport = nodemailer.createTransport(
      getEmailServerConfig() as never
    );
    await expect(transport.sendMail(message)).rejects.toThrow();
    expect(smtp.state.gotData).toBe(false);
    smtp.close();
  });
});
