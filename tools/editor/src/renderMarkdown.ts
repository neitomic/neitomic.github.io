import MarkdownIt from 'markdown-it'

/**
 * GFM-ish preview: CommonMark + linkify + soft image/code/prose trust.
 * html disabled (no invented HTML dialect / XSS from post content).
 * Not full kramdown parity — intentional.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
  langPrefix: 'language-',
})

export function renderMarkdown(source: string): string {
  return md.render(source ?? '')
}

export function previewMarkdownSource(mode: 'write' | 'source', body: string, raw: string): string {
  if (mode === 'write') return body
  // Source mode: preview body only (skip YAML frontmatter)
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  return match ? raw.slice(match[0].length) : raw
}
