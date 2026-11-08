function splitFrontmatter(raw: string): { head: string; body: string } | null {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  if (!match) return null
  return { head: match[0], body: raw.slice(match[0].length) }
}

function quoteTitle(title: string): string {
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

function parseTitleLine(head: string): string {
  const match = head.match(/^title:\s*(.*)$/m)
  if (!match) return ''
  const raw = match[1].trim()
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    try {
      return JSON.parse(raw.startsWith('"') ? raw : raw.replace(/^'|'$/g, '"'))
    } catch {
      return raw.slice(1, -1)
    }
  }
  return raw
}

/** Mirror server serializePost for entering Source mode without a round-trip. */
export function rebuildRaw(input: {
  originalRaw: string
  originalTitle: string
  originalBody: string
  title: string
  body: string
}): string {
  const { originalRaw, originalTitle, originalBody, title, body } = input
  if (title === originalTitle && body === originalBody) {
    return originalRaw
  }

  const parts = splitFrontmatter(originalRaw)
  if (!parts) {
    return [
      '---',
      'layout: post',
      `title:  ${quoteTitle(title)}`,
      'tags: []',
      '---',
      '',
      body.replace(/^\n/, ''),
    ].join('\n')
  }

  let head = parts.head
  if (title !== originalTitle) {
    head = replaceTitleLine(head, title)
  }
  return head + body
}

export function parseRaw(raw: string): { title: string; body: string } {
  const parts = splitFrontmatter(raw)
  if (!parts) {
    return { title: '', body: raw }
  }
  return {
    title: parseTitleLine(parts.head),
    body: parts.body,
  }
}
