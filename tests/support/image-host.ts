// Local throwaway HTTP host serving the fixtures listed in test-plan.md §Test data, started per
// suite. Used by the safe-fetcher tests (T03+) and by anything exercising the logo-fetch flow.
//
// Fixtures (all under the returned base URL):
//   GET /small.png              - a small valid image (1x1 PNG, ~70 bytes)
//   GET /large-5mb.png          - a 5 MB image body
//   GET /false-content-length   - declares a Content-Length that doesn't match the real body
//   GET /html.html              - an HTML page (not an image)
//   GET /slow-drip              - dribbles bytes slowly, never really finishing quickly
//   GET /redirect/private       - 302s to a private-address destination (never actually reachable
//                                 through this host; the fetcher must refuse it before connecting)
//   GET /redirect/downgrade     - 302s from https-style semantics down to a plain http URL
//   GET /redirect/chain-4       - 4 chained 302s before reaching /small.png
//   GET /drop-mid-body          - starts a body then destroys the socket before finishing
//
// Rebinding (pointing a hostname at this host's address) is the caller's job via an injected
// DnsResolver (see ./dns-resolver.ts) - this host only serves content.

import http from 'node:http';
import type { AddressInfo } from 'node:net';

// 1x1 transparent PNG, the same bytes as the openapi.yaml LogoFetchSuccess example.
const SMALL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==',
  'base64'
);

const FIVE_MB = 5 * 1024 * 1024;

export interface ImageHost {
  baseUrl: string;
  port: number;
  close(): Promise<void>;
}

export async function startImageHost(): Promise<ImageHost> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;

    switch (url.pathname) {
      case '/small.png': {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': SMALL_PNG.length,
        });
        res.end(SMALL_PNG);
        return;
      }

      case '/large-5mb.png': {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': FIVE_MB,
        });
        res.end(Buffer.alloc(FIVE_MB, 0));
        return;
      }

      case '/false-content-length': {
        // Claims a body far larger than what actually arrives, so a naive
        // Content-Length-trusting reader would hang or over-read.
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': FIVE_MB,
        });
        res.end(SMALL_PNG);
        return;
      }

      case '/html.html': {
        const body = '<!doctype html><html><body>not an image</body></html>';
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': body.length });
        res.end(body);
        return;
      }

      case '/slow-drip': {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        let sent = 0;
        const interval = setInterval(() => {
          if (sent >= SMALL_PNG.length) {
            clearInterval(interval);
            res.end();
            return;
          }
          res.write(SMALL_PNG.subarray(sent, sent + 1));
          sent += 1;
        }, 200);
        req.on('close', () => clearInterval(interval));
        return;
      }

      case '/redirect/private': {
        // 169.254.169.254 is the cloud-metadata address; never actually reachable through this
        // host, the point is the Location header alone.
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
        return;
      }

      case '/redirect/downgrade': {
        res.writeHead(302, { Location: `${base.replace('https://', 'http://')}/small.png` });
        res.end();
        return;
      }

      case '/redirect/chain-4': {
        res.writeHead(302, { Location: `${base}/redirect/chain-3` });
        res.end();
        return;
      }
      case '/redirect/chain-3': {
        res.writeHead(302, { Location: `${base}/redirect/chain-2` });
        res.end();
        return;
      }
      case '/redirect/chain-2': {
        res.writeHead(302, { Location: `${base}/redirect/chain-1` });
        res.end();
        return;
      }
      case '/redirect/chain-1': {
        res.writeHead(302, { Location: `${base}/small.png` });
        res.end();
        return;
      }

      case '/drop-mid-body': {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': FIVE_MB });
        res.write(SMALL_PNG);
        setTimeout(() => req.socket.destroy(), 50);
        return;
      }

      default: {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
