// Tiny static server for the e2e smoke test. Plain JS (no build step) so Playwright's
// `webServer.command` can start it directly with `node`. Real e2e-through-UI tests (later tasks)
// run against the actual Next.js app instead - see tests/README.md.
import http from 'node:http';

const port = Number(process.env.PORT ?? 4310);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><html><head><title>e2e harness smoke</title></head><body><h1>ok</h1></body></html>');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`e2e static smoke server listening on http://127.0.0.1:${port}`);
});
