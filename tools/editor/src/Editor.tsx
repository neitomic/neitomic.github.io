import { useCallback, useEffect, useRef, useState } from 'react'
import type { PostDocument, PublishResult } from './api'
import { savePost, saveRawPost } from './api'
import { MarkdownField } from './MarkdownField'
import { PreviewPane } from './PreviewPane'
import { PublishSheet } from './PublishSheet'
import { ReviewSheet } from './ReviewSheet'
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
  const [previewOn, setPreviewOn] = useState(false)
  const [focusOn, setFocusOn] = useState(true)
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
  const [publishOpen, setPublishOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [lastPublish, setLastPublish] = useState<PublishResult | null>(null)

  const dirty =
    mode === 'source'
      ? raw !== baseline.raw
      : title !== baseline.title || body !== baseline.body

  const savingRef = useRef(false)
  const titleRef = useRef(title)
  const bodyRef = useRef(body)
  const rawRef = useRef(raw)
  const modeRef = useRef(mode)
  const previewBeforeFocus = useRef(false)
  titleRef.current = title
  bodyRef.current = body
  rawRef.current = raw
  modeRef.current = mode

  // Only reset editor chrome when opening a different file.
  useEffect(() => {
    setMode('write')
    setFocusOn(true)
    setPreviewOn(false)
    previewBeforeFocus.current = false
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
  }, [post.filename])

  useEffect(() => {
    if (dirty) {
      setSaveState((s) => (s === 'saving' ? s : 'unsaved'))
    }
  }, [dirty])

  const exitFocus = useCallback(() => {
    setFocusOn(false)
    setPreviewOn(previewBeforeFocus.current)
  }, [])

  const enterFocus = useCallback(() => {
    previewBeforeFocus.current = previewOn
    setPreviewOn(false)
    setFocusOn(true)
  }, [previewOn])

  // Escape restores chrome (library / metadata affordances) in one action.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (publishOpen || reviewOpen) return
      if (focusOn) {
        e.preventDefault()
        exitFocus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusOn, exitFocus, publishOpen, reviewOpen])

  function enterSource() {
    if (focusOn) exitFocus()
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
      setFocusOn(true)
      setPreviewOn(false)
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
      throw err
    } finally {
      savingRef.current = false
    }
  }

  const ensureSaved = useCallback(async () => {
    if (titleRef.current !== baseline.title || bodyRef.current !== baseline.body) {
      if (modeRef.current === 'write') {
        savingRef.current = true
        setSaveState('saving')
        try {
          const saved = await savePost(
            baseline.filename,
            titleRef.current,
            bodyRef.current,
          )
          setBaseline({
            filename: saved.filename,
            title: saved.title,
            body: saved.body,
            raw: saved.raw,
          })
          setTitle(saved.title)
          setBody(saved.body)
          setRaw(saved.raw)
          setSaveState('saved')
          setLastSavedAt(new Date())
          onSaved(saved)
        } finally {
          savingRef.current = false
        }
        return
      }
    }
    if (modeRef.current === 'source' && rawRef.current !== baseline.raw) {
      savingRef.current = true
      setSaveState('saving')
      try {
        const saved = await saveRawPost(baseline.filename, rawRef.current)
        setBaseline({
          filename: saved.filename,
          title: saved.title,
          body: saved.body,
          raw: saved.raw,
        })
        setTitle(saved.title)
        setBody(saved.body)
        setRaw(saved.raw)
        setSaveState('saved')
        setLastSavedAt(new Date())
        onSaved(saved)
      } finally {
        savingRef.current = false
      }
    }
  }, [baseline.title, baseline.body, baseline.raw, baseline.filename, onSaved])

  function openPublish() {
    if (focusOn) exitFocus()
    setPublishOpen(true)
  }

  function openReview() {
    if (focusOn) exitFocus()
    // Prefer write-mode title/body; if Source is open, parse raw for the coach.
    if (modeRef.current === 'source') {
      try {
        const parsed = parseRaw(rawRef.current)
        setTitle(parsed.title)
        setBody(parsed.body)
      } catch {
        /* sheet still opens with last known title/body */
      }
    }
    setReviewOpen(true)
  }

  function reviewTitle() {
    if (mode === 'source') {
      try {
        return parseRaw(raw).title
      } catch {
        return title
      }
    }
    return title
  }

  function reviewBody() {
    if (mode === 'source') {
      try {
        return parseRaw(raw).body
      } catch {
        return body
      }
    }
    return body
  }

  useEffect(() => {
    if (!dirty) return
    const handle = window.setTimeout(() => {
      void persist('auto').catch(() => {
        /* error already reflected in saveState */
      })
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
          : lastPublish?.ok
            ? 'Pushed'
            : lastSavedAt
              ? `Saved ${lastSavedAt.toLocaleTimeString()}`
              : 'Saved'

  const quiet = focusOn && mode === 'write'

  const onImageError = useCallback((message: string) => {
    setSaveError(`Image: ${message}`)
  }, [])

  return (
    <div
      className={`editor ${previewOn ? 'with-preview' : ''} ${quiet ? 'focus-quiet' : ''}`}
    >
      {quiet ? (
        <div className="focus-restore" role="toolbar" aria-label="Focus controls">
          <button type="button" className="ghost" onClick={onBack}>
            ← Library
          </button>
          <button type="button" className="ghost" onClick={exitFocus}>
            Exit focus
          </button>
          <span className="focus-hint">Esc shows chrome</span>
          <p className={`save-pill ${saveState}`} aria-live="polite">
            {statusLabel}
          </p>
          <button type="button" className="ghost" onClick={openReview}>
            Review writing
          </button>
          <button
            type="button"
            className="ghost"
            onClick={openPublish}
          >
            Publish…
          </button>
          <button
            type="button"
            className="primary"
            disabled={!dirty || saveState === 'saving'}
            onClick={() => void persist('manual')}
          >
            Save
          </button>
        </div>
      ) : (
        <>
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
            <button
              type="button"
              className={`ghost mode-toggle ${previewOn ? 'active' : ''}`}
              onClick={() => setPreviewOn((v) => !v)}
              aria-pressed={previewOn}
            >
              Preview
            </button>
            {mode === 'write' && (
              <button
                type="button"
                className={`ghost mode-toggle ${focusOn ? 'active' : ''}`}
                onClick={() => (focusOn ? exitFocus() : enterFocus())}
                aria-pressed={focusOn}
              >
                Focus
              </button>
            )}
            <button type="button" className="ghost" onClick={openReview}>
              Review writing
            </button>
            <button type="button" className="ghost" onClick={openPublish}>
              Publish…
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
            {previewOn && (
              <>
                <span className="sep">·</span>
                <span>live preview</span>
              </>
            )}
          </p>
        </>
      )}

      {saveError && (
        <p className="hint error-text" role="alert">
          {saveError}
        </p>
      )}

      <div className={`editor-split ${previewOn && !quiet ? 'split-on' : ''}`}>
        <div className="editor-main">
          {mode === 'write' ? (
            <>
              <label className={`title-field ${quiet ? 'title-quiet' : ''}`}>
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
                  focusMode={quiet}
                  onImageError={onImageError}
                  placeholder="Write in Markdown… (drop or paste images)"
                />
              </div>
            </>
          ) : (
            <div className="body-field source-field">
              <MarkdownField
                mode="source"
                value={raw}
                onChange={setRaw}
                onImageError={onImageError}
                placeholder="Full Markdown source including frontmatter… (drop or paste images)"
              />
            </div>
          )}
        </div>

        {previewOn && !quiet && (
          <PreviewPane mode={mode} body={body} raw={raw} title={title} />
        )}
      </div>

      {publishOpen && (
        <PublishSheet
          postFilename={baseline.filename}
          title={title}
          onEnsureSaved={ensureSaved}
          onClose={() => setPublishOpen(false)}
          onPublished={(res) => {
            setLastPublish(res)
            setSaveState('saved')
          }}
        />
      )}

      {reviewOpen && (
        <ReviewSheet
          filename={baseline.filename}
          title={reviewTitle()}
          body={reviewBody()}
          onEnsureSaved={ensureSaved}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  )
}
