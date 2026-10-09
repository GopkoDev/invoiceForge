import fs from 'node:fs';
import path from 'node:path';
import type MarkdownIt from 'markdown-it';

// The docs are written for the repo, not the site: they link to folders without an index
// (../adr/), to files outside docs/ (CONTEXT.md, migrations/*.sql) and, in PR bodies, from the
// repo root (docs/features/...). Links that land on a page of the site stay in the site;
// everything else opens on GitHub.

const REPO_URL = 'https://github.com/GopkoDev/invoiceForge';
const BRANCH = 'main';

export function repoLinks(
  md: MarkdownIt,
  { repoRoot, docsDir }: { repoRoot: string; docsDir: string }
) {
  const defaultRender =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href');
    const relativePath: string | undefined = env.relativePath;
    if (href && relativePath && isRepoRelative(href)) {
      const rewritten = rewrite(href, relativePath, repoRoot, docsDir);
      if (rewritten) token.attrSet('href', rewritten);
    }
    return defaultRender(tokens, idx, options, env, self);
  };
}

function isRepoRelative(href: string) {
  return !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href);
}

function rewrite(
  href: string,
  relativePath: string,
  repoRoot: string,
  docsDir: string
): string | undefined {
  const [target, hash = ''] = splitHash(decodeURI(href));
  const fromDir = path.dirname(path.join(docsDir, relativePath));
  // PR bodies link from the repo root ("docs/features/x/spec.md"); everything else is file-relative.
  const base = target.startsWith('docs/') ? repoRoot : fromDir;
  const abs = path.resolve(base, target);
  const suffix = hash ? `#${hash}` : '';

  const insideDocs = abs === docsDir || abs.startsWith(docsDir + path.sep);
  if (insideDocs) {
    const page = sitePage(abs, docsDir);
    if (page !== undefined) return page + suffix;
  }

  if (!fs.existsSync(abs)) return undefined; // leave it for VitePress's dead-link check
  const kind = fs.statSync(abs).isDirectory() ? 'tree' : 'blob';
  return `${REPO_URL}/${kind}/${BRANCH}/${path.relative(repoRoot, abs).split(path.sep).join('/')}${suffix}`;
}

function sitePage(abs: string, docsDir: string): string | undefined {
  const toUrl = (file: string) =>
    '/' +
    path
      .relative(docsDir, file)
      .split(path.sep)
      .join('/')
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '');
  if (abs.endsWith('.md') && fs.existsSync(abs)) return toUrl(abs);
  if (fs.existsSync(abs + '.md')) return toUrl(abs + '.md');
  if (fs.existsSync(path.join(abs, 'index.md')))
    return toUrl(path.join(abs, 'index.md'));
  return undefined;
}

function splitHash(href: string): [string, string?] {
  const i = href.indexOf('#');
  return i === -1 ? [href] : [href.slice(0, i), href.slice(i + 1)];
}
