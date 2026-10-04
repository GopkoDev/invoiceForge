// Local test mail sink for the e2e app server: a minimal SMTP server over implicit TLS
// (port 465 is the one port the app's mail config treats as TLS-from-the-start, AC-16), so the app
// sends the Sign-in link through its real provider hooks and TLS-only transport. Each accepted
// message is written raw to `dir` as one .eml file for tests/e2e/support/genuine-session.ts.
// Plain JS: it runs under Playwright's webServer command, outside the TS loader.
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';

export const MAIL_SINK_PORT = 465;
export const MAIL_SINK_HOST = 'localhost';

/** Writes a throwaway self-signed certificate valid for `localhost` and returns its paths. */
export function createSinkCertificate(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const key = path.join(dir, 'sink-key.pem');
  const cert = path.join(dir, 'sink-cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ],
    { stdio: 'ignore' }
  );
  return { key, cert };
}

export function startMailSink({ dir, key, cert, port = MAIL_SINK_PORT }) {
  fs.mkdirSync(dir, { recursive: true });
  let counter = 0;

  const server = tls.createServer(
    { key: fs.readFileSync(key), cert: fs.readFileSync(cert) },
    (socket) => {
      let buffer = '';
      let data = null;
      const reply = (line) => socket.write(`${line}\r\n`);
      socket.on('error', () => {});
      reply('220 localhost e2e mail sink');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        for (;;) {
          if (data !== null) {
            const end = buffer.indexOf('\r\n.\r\n');
            if (end === -1) return;
            data += buffer.slice(0, end);
            buffer = buffer.slice(end + 5);
            counter += 1;
            fs.writeFileSync(
              path.join(dir, `${Date.now()}-${counter}.eml`),
              data
            );
            data = null;
            reply('250 queued');
            continue;
          }
          const eol = buffer.indexOf('\r\n');
          if (eol === -1) return;
          const line = buffer.slice(0, eol);
          buffer = buffer.slice(eol + 2);
          const command = line.slice(0, 4).toUpperCase();
          if (command === 'EHLO' || command === 'HELO') {
            socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
          } else if (command === 'AUTH') {
            reply('235 ok');
          } else if (command === 'DATA') {
            data = '';
            reply('354 end with <CRLF>.<CRLF>');
          } else if (command === 'QUIT') {
            reply('221 bye');
            socket.end();
            return;
          } else {
            reply('250 ok');
          }
        }
      });
    }
  );
  server.listen(port);
  return server;
}
