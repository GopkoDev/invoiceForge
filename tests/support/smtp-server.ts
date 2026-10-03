// Minimal local SMTP server over the TLS fixtures (spec.md §5 AC-16; security-patch T10, T34).
// Speaks just enough of the dialogue for nodemailer to send, so tests drive a real transport.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';

export const tlsFixtures = path.resolve(__dirname, 'fixtures/tls');
/** The fixture CA; certificates `right-name` and `wrong-name` are issued by it. */
export const fixtureCa = fs.readFileSync(path.join(tlsFixtures, 'ca-cert.pem'));

export interface SmtpServerOptions {
  /** false: STARTTLS is not offered and refused with 502, like a server without TLS. */
  offerStartTls?: boolean;
  /** Fixture certificate: `test` (self-signed), `right-name` or `wrong-name` (fixture CA). */
  certName?: 'test' | 'right-name' | 'wrong-name';
  /**
   * Never answer the first DATA and drop that connection after this many ms (a send that hangs
   * and then loses its connection). Later DATA commands are served normally.
   */
  stallFirstDataMs?: number;
  /**
   * Close the first connection before the greeting, the case nodemailer's pool answers by
   * re-queueing the message for another connection (up to `maxRequeues`).
   */
  dropFirstConnectionBeforeGreeting?: boolean;
}

export interface SmtpServer {
  port: number;
  state: {
    /** Any MAIL, AUTH or DATA seen in clear text or over TLS. */
    gotData: boolean;
    /** Messages fully received and accepted with 250. */
    delivered: number;
    /** DATA commands received. */
    dataCommands: number;
    /** TCP connections accepted. */
    connections: number;
  };
  close: () => void;
}

export function startSmtp({
  offerStartTls = true,
  certName = 'test',
  stallFirstDataMs,
  dropFirstConnectionBeforeGreeting = false,
}: SmtpServerOptions = {}): Promise<SmtpServer> {
  const state = { gotData: false, delivered: 0, dataCommands: 0, connections: 0 };
  const sockets = new Set<net.Socket>();

  const serveSecure = (secure: tls.TLSSocket) => {
    secure.on('error', () => {});
    let inData = false;
    secure.on('data', (chunk) => {
      for (const l of chunk.toString().split('\r\n').filter(Boolean)) {
        const c = l.toUpperCase();
        if (inData) {
          if (l === '.') {
            inData = false;
            state.delivered++;
            secure.write('250 queued\r\n');
          }
        } else if (c.startsWith('EHLO')) {
          secure.write('250-test\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (c.startsWith('AUTH')) {
          secure.write('235 ok\r\n');
        } else if (c === 'DATA') {
          state.gotData = true;
          state.dataCommands++;
          if (stallFirstDataMs !== undefined && state.dataCommands === 1) {
            setTimeout(() => secure.destroy(), stallFirstDataMs);
            return;
          }
          inData = true;
          secure.write('354 go\r\n');
        } else if (c === 'QUIT') {
          secure.end('221 bye\r\n');
        } else {
          secure.write('250 ok\r\n');
        }
      }
    });
  };

  const handle = (socket: net.Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    state.connections++;
    if (dropFirstConnectionBeforeGreeting && state.connections === 1) {
      socket.end();
      return;
    }
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
        } else if (cmd === 'STARTTLS') {
          if (!offerStartTls) {
            socket.write('502 5.5.1 STARTTLS not available\r\n');
            continue;
          }
          socket.write('220 go ahead\r\n');
          socket.removeAllListeners('data');
          serveSecure(
            new tls.TLSSocket(socket, {
              isServer: true,
              key: fs.readFileSync(path.join(tlsFixtures, `${certName}-key.pem`)),
              cert: fs.readFileSync(
                path.join(tlsFixtures, `${certName}-cert.pem`)
              ),
            })
          );
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
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: (server.address() as net.AddressInfo).port,
        state,
        close: () => {
          for (const s of sockets) s.destroy();
          server.close();
        },
      })
    )
  );
}
