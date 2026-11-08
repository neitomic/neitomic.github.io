import { promises as fs } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { resolveRepoRoot } from './repo.ts'

const POST_FILENAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/i

export type PostListItem = {
  filename: string
  title: string
  date: string | null
}

export type PostDocument = {
  filename: string
  title: string
  body: string
  layout: string
  date: string | null
  tags: string[]
  /** Full frontmatter object; unknown keys preserved for edited saves. */
  data: Record<string, unknown>
  /** Exact file bytes as read from disk (for no-edit identity). */
  raw: string
}

function postsDir(repoRoot: string): string {
  return path.join(repoRoot, '_posts')
}

export function assertSafePostFilename(filename: string): string {
  const base = path.basename(filename)
  if (base !== filename || filename.includes('\0')) {
    throw new Error('Invalid post filename')
  }
  if (!POST_FILENAME.test(base)) {
    throw new Error(
      'Post filename must look like YYYY-MM-DD-slug.md (lowercase slug segments)',
    )
  }
  return base
}

async function postPath(filename: string): Promise<string> {
  const safe = assertSafePostFilename(filename)
  const root = await resolveRepoRoot()
  const dir = path.resolve(postsDir(root))
  const resolved = path.resolve(dir, safe)
  const rel = path.relative(dir, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes _posts/')
  }
  return resolved
}

function asTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((t) => String(t))
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,\s]+/).filter(Boolean)
  }
  return []
}

function asDateString(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

export function parsePost(filename: string, raw: string): PostDocument {
  const parsed = matter(raw)
  const data = { ...(parsed.data as Record<string, unknown>) }
  return {
    filename,
    title: data.title == null ? '' : String(data.title),
    body: parsed.content,
    layout: data.layout == null ? 'post' : String(data.layout),
    date: asDateString(data.date),
    tags: asTags(data.tags),
    data,
    raw,
  }
}

/**
 * Frontmatter block including closing --- and the newline that follows it.
 * Body is everything after that prefix (matches gray-matter `content`).
 */
function splitFrontmatter(raw: string): { head: string; body: string } | null {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  if (!match) return null
  return { head: match[0], body: raw.slice(match[0].length) }
}

function quoteTitle(title: string): string {
  // Match existing posts: title:  "…"
  return JSON.stringify(title)
}

function replaceTitleLine(head: string, title: string): string {
  const line = `title:  ${quoteTitle(title)}`
  if (/^title:\s*.*$/m.test(head)) {
    return head.replace(/^title:\s*.*$/m, line)
  }
  if (/^layout:\s*.*$/m.test(head)) {
    return head.replace(/^(layout:\s*.*$)/m, `$1\n${line}`)
  }
  return head.replace(/^(---\r?\n)/, `$1${line}\n`)
}

/**
 * Serialize an edited post.
 * - No title/body change → exact original bytes (golden-file identity).
 * - Body-only change → keep original YAML bytes; swap body.
 * - Title change → keep other YAML lines; rewrite title line only.
 */
export function serializePost(input: {
  original: PostDocument
  title: string
  body: string
}): string {
  const { original, title, body } = input
  if (title === original.title && body === original.body) {
    return original.raw
  }

  const parts = splitFrontmatter(original.raw)
  if (!parts) {
    const data = { ...original.data, title, layout: original.layout || 'post' }
    return matter.stringify(body, data)
  }

  let head = parts.head
  if (title !== original.title) {
    head = replaceTitleLine(head, title)
  }

  return head + body
}

export async function listPosts(): Promise<PostListItem[]> {
  const root = await resolveRepoRoot()
  const dir = postsDir(root)
  const names = await fs.readdir(dir)
  const items: PostListItem[] = []

  for (const name of names) {
    if (!name.endsWith('.md')) continue
    if (!POST_FILENAME.test(name)) continue
    const raw = await fs.readFile(path.join(dir, name), 'utf8')
    const doc = parsePost(name, raw)
    items.push({
      filename: name,
      title: doc.title || name,
      date: doc.date,
    })
  }

  items.sort((a, b) => b.filename.localeCompare(a.filename))
  return items
}

export async function readPost(filename: string): Promise<PostDocument> {
  const full = await postPath(filename)
  const raw = await fs.readFile(full, 'utf8')
  return parsePost(path.basename(full), raw)
}

export async function writePost(
  filename: string,
  title: string,
  body: string,
): Promise<PostDocument> {
  const full = await postPath(filename)
  const raw = await fs.readFile(full, 'utf8')
  const original = parsePost(path.basename(full), raw)
  const next = serializePost({ original, title, body })
  await fs.writeFile(full, next, 'utf8')
  return parsePost(path.basename(full), next)
}

/** Source-mode escape hatch: write the exact raw buffer. */
export async function writeRawPost(
  filename: string,
  raw: string,
): Promise<PostDocument> {
  const full = await postPath(filename)
  await fs.writeFile(full, raw, 'utf8')
  return parsePost(path.basename(full), raw)
}

/** Wall-clock parts in Asia/Ho_Chi_Minh (+0700). */
export function nowInIct(d = new Date()): {
  yyyy: string
  mm: string
  dd: string
  HH: string
  MM: string
  SS: string
  datePrefix: string
  dateField: string
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    fmt
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const yyyy = parts.year
  const mm = parts.month
  const dd = parts.day
  const HH = parts.hour
  const MM = parts.minute
  const SS = parts.second
  return {
    yyyy,
    mm,
    dd,
    HH,
    MM,
    SS,
    datePrefix: `${yyyy}-${mm}-${dd}`,
    dateField: `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS} +0700`,
  }
}

export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return base || 'post'
}

export type CreatePostInput = {
  title: string
  slug?: string
  datePrefix?: string
  tags?: string[]
}

export async function createPost(input: CreatePostInput): Promise<PostDocument> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')

  const ict = nowInIct()
  const datePrefix = input.datePrefix?.trim() || ict.datePrefix
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
    throw new Error('datePrefix must be YYYY-MM-DD')
  }

  const slug = slugify(input.slug?.trim() || title)
  const filename = assertSafePostFilename(`${datePrefix}-${slug}.md`)
  const full = await postPath(filename)

  try {
    await fs.access(full)
    throw new Error(`Post already exists: ${filename}`)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Post already exists')) {
      throw err
    }
  }

  const tags = input.tags ?? []
  const tagsYaml = tags.length ? `[${tags.join(', ')}]` : '[]'
  const dateField =
    datePrefix === ict.datePrefix
      ? ict.dateField
      : `${datePrefix} ${ict.HH}:${ict.MM}:${ict.SS} +0700`

  const file = [
    '---',
    'layout: post',
    `title:  ${quoteTitle(title)}`,
    `date:   ${dateField}`,
    `tags: ${tagsYaml}`,
    '---',
    '',
    '',
  ].join('\n')

  await fs.writeFile(full, file, 'utf8')
  return parsePost(filename, file)
}
