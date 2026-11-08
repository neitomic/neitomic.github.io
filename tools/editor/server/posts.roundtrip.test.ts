import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePost, serializePost, slugify } from './posts.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const postsDir = path.join(repoRoot, '_posts')

describe('serializePost golden round-trip', () => {
  const files = readdirSync(postsDir).filter((f) => f.endsWith('.md'))

  it('finds existing posts to test', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const filename of files) {
    it(`open → save without edits is byte-identical: ${filename}`, () => {
      const raw = readFileSync(path.join(postsDir, filename), 'utf8')
      const original = parsePost(filename, raw)
      const out = serializePost({
        original,
        title: original.title,
        body: original.body,
      })
      expect(out).toBe(raw)
    })
  }

  it('body-only edit keeps original YAML bytes', () => {
    const filename = files[0]
    const raw = readFileSync(path.join(postsDir, filename), 'utf8')
    const original = parsePost(filename, raw)
    const body = `${original.body}\n\n<!-- editor touch -->\n`
    const out = serializePost({ original, title: original.title, body })
    const head = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)?.[0]
    expect(head).toBeTruthy()
    expect(out.startsWith(head!)).toBe(true)
    expect(out.slice(head!.length)).toBe(body)
  })

  it('title edit rewrites title line and preserves other frontmatter lines', () => {
    const filename = files[0]
    const raw = readFileSync(path.join(postsDir, filename), 'utf8')
    const original = parsePost(filename, raw)
    const out = serializePost({
      original,
      title: `${original.title} (edited)`,
      body: original.body,
    })
    expect(out).toContain(`title:  ${JSON.stringify(`${original.title} (edited)`)}`)
    expect(out).toContain('layout: post')
    expect(out.endsWith(original.body) || out.includes(original.body)).toBe(true)
    // Unknown / sibling keys: date + tags lines still present as in original head
    const origHead = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? ''
    for (const line of origHead.split(/\r?\n/)) {
      if (!line.startsWith('title:')) {
        expect(out).toContain(line)
      }
    }
  })
})

describe('slugify', () => {
  it('builds url-safe slugs', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
    expect(slugify('  --Foo--Bar--  ')).toBe('foo-bar')
  })
})
