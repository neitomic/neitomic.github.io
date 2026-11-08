import { useEffect, useState } from 'react'
import {
  fetchReviewConfig,
  requestWritingReview,
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

export function ReviewSheet({
  filename,
  title,
  body,
  onEnsureSaved,
  onClose,
}: Props) {
  const [config, setConfig] = useState<ReviewConfig | null>(null)
  const [result, setResult] = useState<ReviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  const postPath = `_posts/${filename}`

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !running) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, onClose])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setCopied(false)
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
        // Auto-run LLM when a key is configured — still on-demand (only when sheet opens).
        if (cfg.llmConfigured) {
          setRunning(true)
          try {
            const ran = await requestWritingReview({
              filename,
              title,
              body,
              run: true,
            })
            if (!cancelled) {
              setResult(ran)
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
  }, [filename, title, body, onEnsureSaved])

  async function onRunLlm() {
    setRunning(true)
    setError(null)
    try {
      await onEnsureSaved()
      const ran = await requestWritingReview({
        filename,
        title,
        body,
        run: true,
      })
      setResult(ran)
      setConfig({
        llmConfigured: ran.llmConfigured,
        model: ran.model,
        baseUrl: ran.baseUrl,
        envHint: ran.envHint,
      })
      if (ran.error) setError(ran.error)
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

  const reviewHtml = result?.review ? renderMarkdown(result.review) : ''

  return (
    <div
      className="publish-backdrop"
      role="presentation"
      onClick={() => {
        if (!running) onClose()
      }}
    >
      <div
        className="publish-sheet review-sheet"
        role="dialog"
        aria-labelledby="review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="publish-header">
          <h2 id="review-title">Review writing</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={running}>
            Close
          </button>
        </header>

        <p className="publish-lede">
          On-demand writing coach for <code>{postPath}</code>. Suggests structure,
          coverage, and clarity — you apply fixes. Does not rewrite the file.
        </p>

        {config && (
          <p className="review-config" role="status">
            {config.llmConfigured ? (
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
                No API key — copy the shared prompt into Cursor / an agent, or set{' '}
                <code>EDITOR_REVIEW_API_KEY</code> (or <code>OPENAI_API_KEY</code>)
                in the shell that runs <code>just editor</code>, then restart.
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

        {result?.review && (
          <section className="review-output" aria-label="Coach review">
            <h3>Coach notes</h3>
            <div
              className="review-body preview-body"
              dangerouslySetInnerHTML={{ __html: reviewHtml }}
            />
          </section>
        )}

        {!loading && !result?.review && result?.prompt && (
          <section className="review-bridge" aria-label="Agent bridge">
            <h3>Agent bridge</h3>
            <p>
              Copy the filled coach prompt and paste it into Cursor (or any agent)
              for a structured review. Same contract as{' '}
              <code>tools/editor/prompts/writing-coach.md</code>.
            </p>
          </section>
        )}

        <div className="publish-actions">
          <button
            type="button"
            className="primary"
            disabled={running || loading || !result?.prompt}
            onClick={() => void onCopyPrompt()}
          >
            {copied ? 'Copied' : 'Copy prompt for agent'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={running || loading || !config?.llmConfigured}
            onClick={() => void onRunLlm()}
          >
            {running ? 'Running…' : 'Run LLM review'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!result?.prompt}
            onClick={() => setShowPrompt((v) => !v)}
          >
            {showPrompt ? 'Hide prompt' : 'Show prompt'}
          </button>
          <button type="button" className="ghost" onClick={onClose} disabled={running}>
            Cancel
          </button>
        </div>

        {showPrompt && result?.prompt && (
          <section className="review-prompt" aria-label="Filled coach prompt">
            <h3>Filled prompt</h3>
            <pre>{result.prompt}</pre>
          </section>
        )}
      </div>
    </div>
  )
}
