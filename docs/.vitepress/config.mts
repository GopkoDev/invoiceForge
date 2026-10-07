import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { generateSidebar } from 'vitepress-sidebar';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoLinks } from './repo-links';
import { escapeHtml } from './escape-html';
import { openapiFeatures } from '../api/[feature].paths';
import { featureTimeline } from './features-timeline';

const docsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const repoRoot = path.dirname(docsDir);

// Reads docs/ in place: the sidebar mirrors the folder tree, so a new feature folder shows up on its own.
const generated = generateSidebar({
  documentRootPath: 'docs',
  useTitleFromFileHeading: true,
  useFolderTitleFromIndexFile: false,
  capitalizeEachWords: true,
  hyphenToSpace: true,
  collapsed: true,
  sortMenusByName: true,
  excludePattern: ['index.md', 'api'],
});

type SidebarItem = { text?: string; link?: string; items?: SidebarItem[] };

// openapi.yaml is not a page, so the folder scan skips it: add its rendered /api/<feature> page to
// that feature's Contracts group.
function addOpenapiPages(items: SidebarItem[], features: Set<string>) {
  for (const item of items) {
    if (!item.items) continue;
    const feature = item.items
      .map(
        (child) => child.link?.match(/^\/?features\/([^/]+)\/contracts\//)?.[1]
      )
      .find(Boolean);
    if (feature && features.has(feature)) {
      item.items.unshift({ text: 'OpenAPI', link: `/api/${feature}` });
    } else {
      addOpenapiPages(item.items, features);
    }
  }
}

// The feature a sidebar group belongs to, read from the first page link under it.
function featureOf(item: SidebarItem): string | undefined {
  const own = item.link?.match(/^\/?features\/([^/]+)\//)?.[1];
  if (own) return own;
  for (const child of item.items ?? []) {
    const found = featureOf(child);
    if (found) return found;
  }
  return undefined;
}

// Features follow docs/changelog.md: in timeline order, each with its status. A feature the
// changelog does not mention goes last, alphabetically, with no status.
function orderFeatures(features: SidebarItem[]) {
  const timeline = featureTimeline(path.join(docsDir, 'changelog.md'));
  const rank = (item: SidebarItem) =>
    timeline.get(featureOf(item) ?? '')?.index ?? Infinity;
  for (const item of features) {
    const status = timeline.get(featureOf(item) ?? '')?.status;
    if (status) item.text = `${item.text} (${status})`;
  }
  features.sort(
    (a, b) => rank(a) - rank(b) || (a.text ?? '').localeCompare(b.text ?? '')
  );
}

// The project description and the changelog open the sidebar; the rest keeps the folder order.
const FIRST = ['/description', '/changelog'];
const pinned = (item: SidebarItem) => {
  const i = FIRST.indexOf('/' + (item.link ?? '').replace(/^\//, ''));
  return i === -1 ? FIRST.length : i;
};

const sidebar = (generated as SidebarItem[]).sort(
  (a, b) => pinned(a) - pinned(b)
);
// Short names for pages whose own heading is too long for the sidebar.
const TITLES: Record<string, string> = {
  '/architecture-map': 'Architecture map',
};
for (const item of sidebar) {
  const title = TITLES['/' + (item.link ?? '').replace(/^\//, '')];
  if (title) item.text = title;
}
const featuresGroup = sidebar.find((item) => item.text === 'Features');
if (featuresGroup?.items) orderFeatures(featuresGroup.items);
addOpenapiPages(sidebar, new Set(openapiFeatures()));

export default withMermaid(
  defineConfig({
    title: 'Invoice Forge Docs',
    description: 'Architecture, feature specs, ADRs and design canon',
    cleanUrls: true,
    markdown: {
      config: (md) =>
        md.use(repoLinks, { repoRoot, docsDir }).use(escapeHtml, {
          allow: (relativePath) =>
            relativePath === 'index.md' || relativePath.startsWith('api/'),
        }),
    },
    lastUpdated: true,
    themeConfig: {
      nav: [{ text: 'Architecture map', link: '/architecture-map' }],
      sidebar,
      outline: { level: [2, 3] },
      search: { provider: 'local' },
      socialLinks: [
        { icon: 'github', link: 'https://github.com/GopkoDev/invoiceForge' },
      ],
    },
    mermaid: {},
    vite: {
      // Mermaid pulls CommonJS deps (dayjs, ...) that the dev server must pre-bundle, or diagrams never render.
      optimizeDeps: {
        include: [
          'mermaid',
          'dayjs',
          'debug',
          '@braintree/sanitize-url',
          'cytoscape',
          'cytoscape-cose-bilkent',
        ],
      },
      // Mermaid ships as one large chunk; it is lazy-loaded, so the size warning is noise.
      build: { chunkSizeWarningLimit: 3000 },
    },
  })
);
