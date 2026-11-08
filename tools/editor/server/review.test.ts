import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  PROMPT_PATH,
  fillCoachPrompt,
  loadCoachTemplate,
} from './review.ts'

describe('writing coach prompt', () => {
  it('template has required section headings and placeholders', async () => {
    const template = await loadCoachTemplate()
    expect(template).toContain('{{PATH}}')
    expect(template).toContain('{{TITLE}}')
    expect(template).toContain('{{BODY}}')
    expect(template).toMatch(/### Structure/)
    expect(template).toMatch(/### Coverage gaps/)
    expect(template).toMatch(/### Clarity/)
    expect(template).toMatch(/### Grammar appendix/)
    expect(template.toLowerCase()).toContain('do not rewrite the full post')
  })

  it('fillCoachPrompt substitutes path, title, and body once each', async () => {
    const template = await readFile(PROMPT_PATH, 'utf8')
    const filled = fillCoachPrompt(template, {
      path: '_posts/2026-11-08-example.md',
      title: 'Example Title',
      body: 'Hello **world**.\n\n```js\nconst x = 1\n```\n',
    })
    expect(filled).toContain('_posts/2026-11-08-example.md')
    expect(filled).toContain('Example Title')
    expect(filled).toContain('Hello **world**')
    expect(filled).toContain('```js')
    expect(filled).not.toContain('{{PATH}}')
    expect(filled).not.toContain('{{TITLE}}')
    expect(filled).not.toContain('{{BODY}}')
  })

  it('uses placeholders when title/body empty', () => {
    const filled = fillCoachPrompt(
      'P={{PATH}}\nT={{TITLE}}\nB={{BODY}}\n',
      { path: '', title: '  ', body: '' },
    )
    expect(filled).toContain('(unknown path)')
    expect(filled).toContain('(untitled)')
    expect(filled).toContain('(empty body)')
  })
})
