# End-to-end tests

Run them with `pnpm test:e2e` (a production build against a throwaway Postgres container; Docker is required).

## Layout baselines

The screenshot baselines in `editor-layout.spec.ts-snapshots/` are Linux-only (`-chromium-linux.png`), drawn by the
Chromium of the official Playwright image that matches `@playwright/test` (CI runs `ubuntu-latest`, so the `-noble`
image), because fonts render differently on every operating system. They were captured on `main`, before the one-tree
layout of ADR-0004, and the spec at HEAD matches them within `maxDiffPixelRatio` 0.002 with the invoice number, dates,
e-mail addresses and the preview page masked. To refresh them on purpose (in a commit of their own), keep the app, its
database and the tests on your machine and run only the browser in the image:
start `docker run -d --rm --name pwbrowser --ipc=host --init --add-host=host.docker.internal:host-gateway -p 3300:3300
-v <repo>/node_modules/.pnpm/playwright-core@<version>/node_modules/playwright-core:/pw:ro
mcr.microsoft.com/playwright:v<version>-noble bash -c "node -e \"require('net').createServer(c=>{const u=require('net').connect(4311,'host.docker.internal');c.pipe(u);u.pipe(c);c.on('error',()=>u.destroy());u.on('error',()=>c.destroy())}).listen(4311,'127.0.0.1')\" & exec node /pw/cli.js run-server --port 3300 --host 0.0.0.0"`
(the forwarder makes the browser's `127.0.0.1:4311` reach the app on your machine), then run
`PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3300/ PW_SNAPSHOT_PLATFORM=linux pnpm exec playwright test
tests/e2e/editor-layout.spec.ts --project=chromium --update-snapshots` and `docker rm -f pwbrowser`. To re-prove "layout
unchanged" against `main`, run the same command with `-g baselines` inside a `git worktree` of `main` that has this spec
and `playwright.config.ts` copied in, then run the spec again at HEAD. On macOS the screenshot tests are skipped unless
`PW_SNAPSHOT_PLATFORM=linux` is set; the structure checks run everywhere.
