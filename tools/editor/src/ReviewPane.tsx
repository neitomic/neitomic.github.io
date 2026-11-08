import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  fetchReviewConfig,
  requestWritingReview,
  type CoachSection,
  type ReviewConfig,
  type ReviewResponse,
} from './api'
import { renderMarkdown } from './renderMarkdown'

type Props = {
  filename: string
  title: string
  body: string
  onEnsureSaved: () => Promise<void>
  onClose: () => void
}

export function ReviewPane({
  filename,
  title,
  body,
  onEnsureSaved,
  onClose,
}: Props) {
  const [config, setConfig] = useState<ReviewConfig | null>(null)
  const [result, setResult] = useState<ReviewResponse | null>(null)
  const [pastedReview, setPastedReview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteDraft, setPasteDraft] = useState('')

  const postPath = `_posts/${filename}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setCopied(false)
      setPastedReview(null)
      try {
        await onEnsureSaved()
        const [cfg, prepared] = await Promise.all([
          fetchReviewConfig(),
          requestWritingReview({
            filename,
            title,
            body,
            run: false,
          }),
        ])
        if (cancelled) return
        setConfig(cfg)
        setResult(prepared)

        // Auto-run when a local CLI or API key is available — still on-demand (panel open).
        if (cfg.cliConfigured || cfg.llmConfigured) {
          setRunning(true)
          try {
            const ran = await requestWritingReview({
              filename,
              title,
              body,
              run: true,
              prefer: 'auto',
            })
            if (!cancelled) {
              setResult(ran)
              setConfig({
                llmConfigured: ran.llmConfigured,
                model: ran.model,
                baseUrl: ran.baseUrl,
                envHint: ran.envHint,
                cliPreference: ran.cliPreference,
                cliConfigured: ran.cliConfigured,
                cliId: ran.cliId,
                cliBinary: ran.cliBinary,
                cliAvailable: ran.cliAvailable,
              })
              if (ran.error) setError(ran.error)
            }
          } catch (err) {
            if (!cancelled) {
              setError(err instanceof Error ? err.message : String(err))
            }
          } finally {
            if (!cancelled) setRunning(false)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // Parent remounts this pane per open (key=generation) with a frozen title/body snapshot.
    // Intentionally omit onEnsureSaved — its identity changes on autosave and must not re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot at mount
  }, [filename, title, body])

  async function onRun(prefer: 'auto' | 'cli' | 'llm' = 'auto') {
    setRunning(true)
    setError(null)
    setPastedReview(null)
    try {
      await onEnsureSaved()
      const ran = await requestWritingReview({
        filename,
        title,
        body,
        run: true,
        prefer,
      })
      setResult(ran)
      setConfig({
        llmConfigured: ran.llmConfigured,
        model: ran.model,
        baseUrl: ran.baseUrl,
        envHint: ran.envHint,
        cliPreference: ran.cliPreference,
        cliConfigured: ran.cliConfigured,
        cliId: ran.cliId,
        cliBinary: ran.cliBinary,
        cliAvailable: ran.cliAvailable,
      })
      if (ran.error && !ran.review) setError(ran.error)
      else if (ran.error) setError(ran.error)
      else setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  async function onCopyPrompt() {
    const text = result?.prompt
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy — select the prompt text manually.')
      setShowPrompt(true)
    }
  }

  function applyPaste() {
    const text = pasteDraft.trim()
    if (!text) return
    setPastedReview(text)
    setShowPaste(false)
    setError(null)
  }

  const displayReview = pastedReview ?? result?.review ?? null
  const sections: CoachSection[] = useMemo(
    () =>
      pastedReview != null
        ? [] // render pasted as full markdown below
        : (result?.sections ?? []),
    [pastedReview, result?.sections],
  )
  const deferredReview = useDeferredValue(displayReview ?? '')
  const reviewHtml = useMemo(
    () => (deferredReview ? renderMarkdown(deferredReview) : ''),
    [deferredReview],
  )
  const sectionHtml = useMemo(() => {
    return sections.map((s) => ({
      ...s,
      html: renderMarkdown(s.body || '_No notes._'),
    }))
  }, [sections])

  const sourceLabel = pastedReview
    ? 'pasted'
    : result?.mode === 'cli'
      ? `CLI · ${result.cliId ?? 'agent'}`
      : result?.mode === 'llm'
        ? `API · ${result.model ?? 'llm'}`
        : null

  return (
    <aside className="preview-pane review-pane" aria-label="Writing review">
      <div className="review-pane-header">
        <p className="preview-label">Review</p>
        <button
          type="button"
          className="ghost review-pane-close"
          onClick={onClose}
          disabled={running}
        >
          Close
        </button>
      </div>

      <p className="review-pane-lede">
        Coach notes for <code>{postPath}</code>
        {sourceLabel ? (
          <>
            {' '}
            · <span className="review-source">{sourceLabel}</span>
          </>
        ) : null}
        . You apply fixes — nothing rewrites the file.
      </p>

      {config && (
        <p className="review-config" role="status">
          {config.cliConfigured ? (
            <>
              CLI ready · <code>{config.cliId}</code>
              {config.cliBinary ? (
                <>
                  {' '}
                  (<code>{config.cliBinary}</code>)
                </>
              ) : null}
            </>
          ) : config.llmConfigured ? (
            <>
              LLM ready
              {config.model ? (
                <>
                  {' '}
                  · <code>{config.model}</code>
                </>
              ) : null}
            </>
          ) : (
            <>
              No CLI / API key — copy the shared prompt into Cursor, paste the
              reply here, or install <code>claude</code> / <code>codex</code> /{' '}
              <code>grok</code> (or set <code>EDITOR_REVIEW_API_KEY</code>).
            </>
          )}
        </p>
      )}

      {loading && <p className="status">Preparing review…</p>}
      {running && <p className="status">Running coach…</p>}

      {error && (
        <p className="hint error-text" role="alert">
          {error}
        </p>
      )}

      {!loading && displayReview && sections.length > 0 && !pastedReview && (
        <div className="review-sections" aria-label="Coach findings">
          {sectionHtml.map((s) => (
            <section key={s.id + s.title} className="review-section">
              <h3 className="review-section-title">{s.title}</h3>
              <div
                className="preview-body review-section-body"
                dangerouslySetInnerHTML={{ __html: s.html }}
              />
            </section>
          ))}
        </div>
      )}

      {!loading && displayReview && (pastedReview || sections.length === 0) && (
        <section className="review-output" aria-label="Coach review">
          <div
            className="preview-body review-body-full"
            dangerouslySetInnerHTML={{ __html: reviewHtml }}
          />
        </section>
      )}

      {!loading && !displayReview && result?.prompt && (
        <section className="review-bridge" aria-label="Agent bridge">
          <p>
            Copy the filled coach prompt into Cursor (or any agent), then{' '}
            <strong>Paste reply</strong> to show findings here. Same contract as{' '}
            <code>tools/editor/prompts/writing-coach.md</code>.
          </p>
        </section>
      )}

      <div className="review-pane-actions">
        <button
          type="button"
          className="primary"
          disabled={running || loading || !result?.prompt}
          onClick={() => void onCopyPrompt()}
        >
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={
            running || loading || (!config?.cliConfigured && !config?.llmConfigured)
          }
          onClick={() => void onRun('auto')}
        >
          {running ? 'Running…' : 'Run coach'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={running || loading}
          onClick={() => {
            setShowPaste((v) => !v)
            setShowPrompt(false)
          }}
        >
          {showPaste ? 'Hide paste' : 'Paste reply'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!result?.prompt}
          onClick={() => {
            setShowPrompt((v) => !v)
            setShowPaste(false)
          }}
        >
          {showPrompt ? 'Hide prompt' : 'Show prompt'}
        </button>
      </div>

      {showPaste && (
        <section className="review-paste" aria-label="Paste coach reply">
          <label>
            <span className="sr-only">Paste coach Markdown reply</span>
            <textarea
              value={pasteDraft}
              onChange={(e) => setPasteDraft(e.target.value)}
              rows={8}
              placeholder="Paste Structure / Coverage gaps / Clarity Markdown here…"
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={!pasteDraft.trim()}
            onClick={applyPaste}
          >
            Show in panel
          </button>
        </section>
      )}

      {showPrompt && result?.prompt && (
        <section className="review-prompt" aria-label="Filled coach prompt">
          <h3>Filled prompt</h3>
          <pre>{result.prompt}</pre>
        </section>
      )}
    </aside>
  )
}
