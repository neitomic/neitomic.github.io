import { describe, expect, it } from 'vitest'
import { previewMarkdownSource, renderMarkdown } from './renderMarkdown'

describe('renderMarkdown', () => {
  it('renders ordinary prose, emphasis, and lists', () => {
    const html = renderMarkdown('Hello **world**\n\n- one\n- two\n')
    expect(html).toContain('<strong>world</strong>')
    expect(html).toContain('<li>one</li>')
  })

  it('renders fenced code without inventing a dialect', () => {
    const html = renderMarkdown('```js\nconst x = 1\n```\n')
    expect(html).toContain('<pre>')
    expect(html).toContain('const x = 1')
  })

  it('renders markdown images with site-root /assets paths', () => {
    const html = renderMarkdown('![alt](/assets/example.png)\n')
    expect(html).toContain('src="/assets/example.png"')
    expect(html).toContain('alt="alt"')
  })

  it('does not pass through raw HTML (no invented HTML dialect)', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\nok\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain('ok')
  })
})

describe('previewMarkdownSource', () => {
  it('uses body in write mode and strips frontmatter in source mode', () => {
    const raw = '---\ntitle: "T"\n---\n\nBody here\n'
    expect(previewMarkdownSource('write', 'from-body', raw)).toBe('from-body')
    expect(previewMarkdownSource('source', 'from-body', raw)).toBe('\nBody here\n')
  })
})
