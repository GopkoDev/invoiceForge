import type MarkdownIt from 'markdown-it';

// Specs write placeholders like /invoices/<id>/edit in prose, which Vue would parse as tags.
// Raw HTML renders as text everywhere except the pages we author ourselves (allowed paths),
// which need <script setup> and components.
export function escapeHtml(
  md: MarkdownIt,
  { allow }: { allow: (relativePath: string) => boolean }
) {
  for (const rule of ['html_block', 'html_inline'] as const) {
    const original = md.renderer.rules[rule];
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      if (env.relativePath && allow(env.relativePath) && original) {
        return original(tokens, idx, options, env, self);
      }
      // Only the angle brackets: that is enough to stop a tag, and it keeps entities that plugins
      // emit as raw HTML (the heading anchor's &ZeroWidthSpace;) intact.
      return tokens[idx].content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
  }
}
