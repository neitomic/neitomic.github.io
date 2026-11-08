import { useMemo, useState, type FormEvent } from 'react'
import { createPost } from './api'

type Props = {
  onCancel: () => void
  onCreated: (filename: string) => void
}

function todayIctPrefix(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA → YYYY-MM-DD
  return fmt.format(new Date())
}

function slugifyPreview(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'post'
  )
}

export function NewPost({ onCancel, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [datePrefix, setDatePrefix] = useState(todayIctPrefix)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filename = useMemo(() => {
    const s = slug.trim() ? slugifyPreview(slug) : slugifyPreview(title)
    return `${datePrefix}-${s}.md`
  }, [title, slug, datePrefix])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const post = await createPost({
        title,
        slug: slug.trim() || undefined,
        datePrefix,
      })
      onCreated(post.filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="new-post">
      <header className="brand">
        <p className="eyebrow">neitomic.xyz</p>
        <h1>New post</h1>
        <p className="lede">
          Creates <code>_posts/YYYY-MM-DD-slug.md</code> with layout, title, date
          (+0700), and tags.
        </p>
      </header>

      <form className="new-form" onSubmit={(e) => void submit(e)}>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Slug <span className="optional">(optional)</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="derived from title"
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={datePrefix}
            onChange={(e) => setDatePrefix(e.target.value)}
            required
          />
        </label>

        <p className="filename-preview">
          File: <code>{filename}</code>
        </p>

        {error && (
          <p className="hint error-text" role="alert">
            {error}
          </p>
        )}

        <div className="toolbar">
          <button type="submit" className="primary" disabled={busy || !title.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
