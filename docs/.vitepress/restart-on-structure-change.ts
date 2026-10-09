import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// The sidebar, the feature order and the OpenAPI pages are built once, when the config loads, so
// `docs:dev` hot-reloads page text but not a new or deleted page, a renamed heading, a changelog
// status or an edited contract. VitePress restarts itself only when the config or one of its
// imports changes, so on such an event this touches the config file to trigger that restart.

const DEBOUNCE_MS = 300;

const firstHeading = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8').match(/^#\s+(.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
};

export function restartOnStructureChange(options: {
  docsDir: string;
  configFile: string;
}): Plugin {
  const { docsDir, configFile } = options;
  const vitepressDir = path.join(docsDir, '.vitepress');
  const changelog = path.join(docsDir, 'changelog.md');

  const inDocs = (file: string) =>
    file.startsWith(docsDir + path.sep) &&
    !file.startsWith(vitepressDir + path.sep);
  const isPage = (file: string) => inDocs(file) && file.endsWith('.md');
  const isContract = (file: string) =>
    inDocs(file) && file.endsWith(`${path.sep}contracts${path.sep}openapi.yaml`);

  // Sidebar titles come from each page's first heading: remember them to spot a rename.
  const headings = new Map<string, string | undefined>();
  const scan = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== vitepressDir) scan(full);
      } else if (entry.name.endsWith('.md')) {
        headings.set(full, firstHeading(full));
      }
    }
  };

  let timer: NodeJS.Timeout | undefined;
  const restart = (reason: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.info(`[docs] ${reason}, restarting...`);
      const now = new Date();
      fs.utimesSync(configFile, now, now);
    }, DEBOUNCE_MS);
  };
  const rel = (file: string) => path.relative(docsDir, file);

  return {
    name: 'docs-restart-on-structure-change',
    apply: 'serve',
    configureServer(server) {
      scan(docsDir);
      server.watcher
        .on('add', (file) => {
          if (isPage(file) || isContract(file)) restart(`${rel(file)} added`);
        })
        .on('unlink', (file) => {
          if (isPage(file) || isContract(file)) restart(`${rel(file)} deleted`);
        })
        .on('change', (file) => {
          if (isContract(file) || file === changelog) {
            restart(`${rel(file)} changed`);
          } else if (isPage(file)) {
            const heading = firstHeading(file);
            if (heading !== headings.get(file)) {
              headings.set(file, heading);
              restart(`${rel(file)} heading changed`);
            }
          }
        });
    },
  };
}
