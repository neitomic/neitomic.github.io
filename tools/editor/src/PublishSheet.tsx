import { useEffect, useState } from 'react'
import {
  fetchGitDiff,
  fetchGitStatus,
  publishToGitHub,
  type GitStatusResponse,
  type PublishResult,
} from './api'

type Props = {
  postFilename: string
  title: string
  /** Ensure disk is saved before staging */
  onEnsureSaved: () => Promise<void>
  onClose: () => void
  onPublished: (result: PublishResult) => void
}

export function PublishSheet({
  postFilename,
  title,
  onEnsureSaved,
  onClose,
  onPublished,
}: Props) {
  const [status, setStatus] = useState<GitStatusResponse | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [patch, setPatch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        await onEnsureSaved()
        const st = await fetchGitStatus(postFilename, title)
        if (cancelled) return
        setStatus(st)
        const suggested =
          st.suggested.length > 0
            ? st.suggested
            : [`_posts/${postFilename}`]
        setPaths(suggested)
        setMessage(
          st.defaultMessage ||
            `Update post: ${title.trim() || postFilename}`,
        )
        const diff = await fetchGitDiff(suggested)
        if (cancelled) return
        setPatch(diff.patch || '(no diff — file may already match HEAD)')
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
  }, [postFilename, title, onEnsureSaved])

  async function onPublish() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      await onEnsureSaved()
      const res = await publishToGitHub({
        paths,
        message,
        title,
        post: postFilename,
      })
      setResult(res)
      if (res.ok) {
        onPublished(res)
      } else {
        setError(res.error || 'Publish failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="publish-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="publish-sheet"
        role="dialog"
        aria-labelledby="publish-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="publish-header">
          <h2 id="publish-title">Publish</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="publish-lede">
          Stage this post (and dirty assets), commit with system{' '}
          <code>git</code>, then push. Copy is intentional: this is git, not a
          hosted CMS.
        </p>

        {loading && <p className="status">Reading git status…</p>}

        {status && (
          <section className="publish-meta">
            <p>
              Branch <code>{status.branch ?? 'unknown'}</code>
              <span className="sep">·</span>
              {status.publishable.length === 0
                ? 'no publishable changes'
                : `${status.publishable.length} publishable change(s)`}
            </p>
            <ul className="publish-files">
              {paths.map((p) => {
                const code =
                  status.files.find((f) => f.path === p)?.code ?? '·'
                return (
                  <li key={p}>
                    <code className="file-code">{code}</code> <code>{p}</code>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <label className="publish-message">
          Commit message
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
          />
        </label>

        <section className="publish-diff" aria-label="Diff peek">
          <h3>Diff peek</h3>
          <pre>{patch || '—'}</pre>
        </section>

        {error && (
          <p className="hint error-text" role="alert">
            {error}
          </p>
        )}

        {result && (
          <section
            className={`publish-result ${result.ok ? 'ok' : 'bad'}`}
            aria-live="polite"
          >
            {result.ok ? (
              <p>
                Committed and pushed
                {result.commitSha ? (
                  <>
                    {' '}
                    <code>{result.commitSha.slice(0, 7)}</code>
                  </>
                ) : null}
                . GitHub Pages will deploy from the remote as usual.
              </p>
            ) : (
              <p>
                {result.committed && !result.pushed
                  ? 'Committed locally, but push failed — not published to GitHub Pages.'
                  : 'Not published.'}
              </p>
            )}
            {(result.stderr || result.stdout) && (
              <pre className="publish-log">
                {[result.stderr, result.stdout].filter(Boolean).join('\n')}
              </pre>
            )}
          </section>
        )}

        <div className="publish-actions">
          <button
            type="button"
            className="primary"
            disabled={
              busy ||
              loading ||
              !message.trim() ||
              paths.length === 0 ||
              !!result?.ok
            }
            onClick={() => void onPublish()}
          >
            {busy
              ? 'Working…'
              : result?.ok
                ? 'Pushed'
                : 'Commit & push to GitHub Pages'}
          </button>
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
