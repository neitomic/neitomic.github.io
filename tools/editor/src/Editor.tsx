import { useEffect, useRef, useState } from 'react'
import type { PostDocument } from './api'
import { savePost, saveRawPost } from './api'
import { MarkdownField } from './MarkdownField'
import { parseRaw, rebuildRaw } from './rawBuffer'

type Props = {
  post: PostDocument
  onBack: () => void
  onSaved: (post: PostDocument) => void
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'
type EditorMode = 'write' | 'source'

const AUTOSAVE_MS = 900

export function Editor({ post, onBack, onSaved }: Props) {
  const [mode, setMode] = useState<EditorMode>('write')
  const [title, setTitle] = useState(post.title)
  const [body, setBody] = useState(post.body)
  const [raw, setRaw] = useState(post.raw)
  const [baseline, setBaseline] = useState({
    title: post.title,
    body: post.body,
    raw: post.raw,
    filename: post.filename,
  })
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const dirty =
    mode === 'source'
      ? raw !== baseline.raw
      : title !== baseline.title || body !== baseline.body

  const savingRef = useRef(false)
  const titleRef = useRef(title)
  const bodyRef = useRef(body)
  const rawRef = useRef(raw)
  const modeRef = useRef(mode)
  titleRef.current = title
  bodyRef.current = body
  rawRef.current = raw
  modeRef.current = mode

  useEffect(() => {
    setMode('write')
    setTitle(post.title)
    setBody(post.body)
    setRaw(post.raw)
    setBaseline({
      title: post.title,
      body: post.body,
      raw: post.raw,
      filename: post.filename,
    })
    setSaveState('saved')
    setSaveError(null)
  }, [post.filename, post.title, post.body, post.raw])

  useEffect(() => {
    if (dirty) {
      setSaveState((s) => (s === 'saving' ? s : 'unsaved'))
    }
  }, [dirty])

  function enterSource() {
    const nextRaw = rebuildRaw({
      originalRaw: baseline.raw,
      originalTitle: baseline.title,
      originalBody: baseline.body,
      title,
      body,
    })
    setRaw(nextRaw)
    setMode('source')
  }

  function enterWrite() {
    try {
      const parsed = parseRaw(raw)
      setTitle(parsed.title)
      setBody(parsed.body)
      setMode('write')
      setSaveError(null)
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? `Cannot leave Source: ${err.message}`
          : 'Cannot leave Source: invalid frontmatter',
      )
    }
  }

  async function persist(_reason: 'manual' | 'auto') {
    if (!dirty || savingRef.current) return
    const savingFilename = baseline.filename
    const savingMode = modeRef.current
    const savingTitle = titleRef.current
    const savingBody = bodyRef.current
    const savingRaw = rawRef.current
    savingRef.current = true
    setSaveState('saving')
    setSaveError(null)
    try {
      const saved =
        savingMode === 'source'
          ? await saveRawPost(savingFilename, savingRaw)
          : await savePost(savingFilename, savingTitle, savingBody)

      setBaseline({
        filename: saved.filename,
        title: saved.title,
        body: saved.body,
        raw: saved.raw,
      })

      if (savingMode === 'source') {
        if (rawRef.current === savingRaw) setRaw(saved.raw)
        // Keep write-mode fields in sync for the next mode switch.
        setTitle(saved.title)
        setBody(saved.body)
        const stillDirty = rawRef.current !== saved.raw
        setSaveState(stillDirty ? 'unsaved' : 'saved')
      } else {
        if (titleRef.current === savingTitle) setTitle(saved.title)
        if (bodyRef.current === savingBody) setBody(saved.body)
        setRaw(saved.raw)
        const stillDirty =
          titleRef.current !== saved.title || bodyRef.current !== saved.body
        setSaveState(stillDirty ? 'unsaved' : 'saved')
      }

      setLastSavedAt(new Date())
      onSaved(saved)
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : String(err))
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
  }, [title, body, raw, mode, dirty, baseline.filename])

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
        <button
          type="button"
          className={`ghost mode-toggle ${mode === 'source' ? 'active' : ''}`}
          onClick={() => (mode === 'source' ? enterWrite() : enterSource())}
        >
          {mode === 'source' ? 'Write' : 'Source'}
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
        <span className="sep">·</span>
        <span>{mode === 'source' ? 'raw source' : 'title + body'}</span>
      </p>

      {saveError && (
        <p className="hint error-text" role="alert">
          {saveError}
        </p>
      )}

      {mode === 'write' ? (
        <>
          <label className="title-field">
            <span className="sr-only">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              spellCheck
            />
          </label>
          <div className="body-field">
            <MarkdownField
              mode="write"
              value={body}
              onChange={setBody}
              placeholder="Write in Markdown…"
            />
          </div>
        </>
      ) : (
        <div className="body-field source-field">
          <MarkdownField
            mode="source"
            value={raw}
            onChange={setRaw}
            placeholder="Full Markdown source including frontmatter…"
          />
        </div>
      )}
    </div>
  )
}
