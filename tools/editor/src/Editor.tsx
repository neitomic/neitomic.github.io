import { useEffect, useRef, useState } from 'react'
import type { PostDocument } from './api'
import { savePost } from './api'

type Props = {
  post: PostDocument
  onBack: () => void
  onSaved: (post: PostDocument) => void
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

const AUTOSAVE_MS = 900

export function Editor({ post, onBack, onSaved }: Props) {
  const [title, setTitle] = useState(post.title)
  const [body, setBody] = useState(post.body)
  const [baseline, setBaseline] = useState({
    title: post.title,
    body: post.body,
    filename: post.filename,
  })
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const dirty = title !== baseline.title || body !== baseline.body
  const savingRef = useRef(false)

  useEffect(() => {
    setTitle(post.title)
    setBody(post.body)
    setBaseline({ title: post.title, body: post.body, filename: post.filename })
    setSaveState('saved')
    setSaveError(null)
  }, [post.filename, post.title, post.body, post.raw])

  useEffect(() => {
    if (dirty) {
      setSaveState((s) => (s === 'saving' ? s : 'unsaved'))
    }
  }, [dirty])

  async function persist(reason: 'manual' | 'auto') {
    if (!dirty || savingRef.current) return
    savingRef.current = true
    setSaveState('saving')
    setSaveError(null)
    try {
      const saved = await savePost(baseline.filename, title, body)
      setBaseline({
        title: saved.title,
        body: saved.body,
        filename: saved.filename,
      })
      setTitle(saved.title)
      setBody(saved.body)
      setSaveState('saved')
      setLastSavedAt(new Date())
      onSaved(saved)
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : String(err))
      if (reason === 'manual') {
        // keep dirty
      }
    } finally {
      savingRef.current = false
    }
  }

  useEffect(() => {
    if (!dirty) return
    const handle = window.setTimeout(() => {
      void persist('auto')
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(handle)
  }, [title, body, dirty, baseline.filename])

  const statusLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Save failed'
        : dirty || saveState === 'unsaved'
          ? 'Unsaved'
          : lastSavedAt
            ? `Saved ${lastSavedAt.toLocaleTimeString()}`
            : 'Saved'

  return (
    <div className="editor">
      <div className="editor-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Library
        </button>
        <p className={`save-pill ${saveState}`} aria-live="polite">
          {statusLabel}
        </p>
        <button
          type="button"
          className="primary"
          disabled={!dirty || saveState === 'saving'}
          onClick={() => void persist('manual')}
        >
          Save
        </button>
      </div>

      <p className="editor-file">
        <code>{post.filename}</code>
        {post.date && (
          <>
            <span className="sep">·</span>
            <span>{post.date}</span>
          </>
        )}
      </p>

      {saveError && (
        <p className="hint error-text" role="alert">
          {saveError}
        </p>
      )}

      <label className="title-field">
        <span className="sr-only">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          spellCheck
        />
      </label>

      <label className="body-field">
        <span className="sr-only">Body</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write in Markdown…"
          spellCheck
        />
      </label>
    </div>
  )
}
