import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  fetchReviewConfig,
  requestWritingReview,
  type CoachSection,
  type ReviewCliId,
  type ReviewConfig,
  type ReviewResponse,
} from './api'
import { renderMarkdown } from './renderMarkdown'
import {
  DEFAULT_REVIEW_SETTINGS,
  EFFORT_OPTIONS,
  MODEL_PRESETS,
  loadReviewSettings,
  modelLabel,
  saveReviewSettings,
  type ReviewEffort,
  type ReviewPanelSettings,
} from './reviewSettings'

type Props = {
  filename: string
  title: string
  body: string
  onEnsureSaved: () => Promise<void>
  onClose: () => void
}

function applyEnvDefaults(
  base: ReviewPanelSettings,
  cfg: ReviewConfig,
): ReviewPanelSettings {
  // localStorage wins when already customized; env fills empty first-run defaults.
  const next = { ...base }
  if (
    base.cli === DEFAULT_REVIEW_SETTINGS.cli &&
    (cfg.envDefaults.cli === 'claude' ||
      cfg.envDefaults.cli === 'codex' ||
      cfg.envDefaults.cli === 'grok')
  ) {
    next.cli = cfg.envDefaults.cli
  }
  if (!base.model.trim() && cfg.envDefaults.model) {
    next.model = cfg.envDefaults.model
  }
  if (
    base.effort === DEFAULT_REVIEW_SETTINGS.effort &&
    cfg.envDefaults.effort &&
    EFFORT_OPTIONS.some((o) => o.value === cfg.envDefaults.effort)
  ) {
    next.effort = cfg.envDefaults.effort as ReviewEffort
  }
  return next
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
  const [settings, setSettings] = useState<ReviewPanelSettings>(() =>
    loadReviewSettings(),
  )
  const [settingsReady, setSettingsReady] = useState(false)

  const postPath = `_posts/${filename}`

  function updateSettings(patch: Partial<ReviewPanelSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveReviewSettings(next)
      return next
    })
  }

  function syncConfigFromResult(ran: ReviewResponse) {
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
      envDefaults: ran.envDefaults,
    })
  }

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

        const nextSettings = applyEnvDefaults(loadReviewSettings(), cfg)
        setSettings(nextSettings)
        saveReviewSettings(nextSettings)
        setSettingsReady(true)

        const canRun = cfg.cliConfigured || cfg.llmConfigured
        if (!canRun) return

        setRunning(true)
        try {
          const ran = await requestWritingReview({
            filename,
            title,
            body,
            run: true,
            prefer: 'auto',
            cli: nextSettings.cli,
            model: nextSettings.model,
            effort: nextSettings.effort,
          })
          if (!cancelled) {
            setResult(ran)
            syncConfigFromResult(ran)
            if (ran.error) setError(ran.error)
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err))
          }
        } finally {
          if (!cancelled) setRunning(false)
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

  async function onRun() {
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
        prefer: 'auto',
        cli: settings.cli,
        model: settings.model,
        effort: settings.effort,
      })
      setResult(ran)
      syncConfigFromResult(ran)
      if (ran.error) setError(ran.error)
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

  const activeCliId: ReviewCliId | 'auto' = settings.cli
  const modelPresets =
    activeCliId === 'auto'
      ? ['', 'sonnet', 'opus', 'gpt-5.4', 'grok-4']
      : MODEL_PRESETS[activeCliId]

  const availableIds = new Set(config?.cliAvailable.map((c) => c.id) ?? [])
  const selectedMissing =
    settings.cli !== 'auto' &&
    config != null &&
    !availableIds.has(settings.cli) &&
    !config.llmConfigured

  const sourceLabel = pastedReview
    ? 'pasted'
    : result?.mode === 'cli'
      ? `CLI · ${result.cliId ?? 'agent'}${result.runModel ? ` · ${result.runModel}` : ''}${result.runEffort ? ` · ${result.runEffort}` : ''}`
      : result?.mode === 'llm'
        ? `API · ${result.runModel ?? result.model ?? 'llm'}`
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

      <fieldset className="review-controls" disabled={running || loading}>
        <legend className="sr-only">Coach run settings</legend>
        <label className="review-control">
          <span>CLI</span>
          <select
            value={settings.cli}
            onChange={(e) =>
              updateSettings({
                cli: e.target.value as ReviewPanelSettings['cli'],
              })
            }
          >
            <option value="auto">Auto (first found)</option>
            <option value="claude">
              Claude{availableIds.has('claude') ? '' : ' — not on PATH'}
            </option>
            <option value="codex">
              Codex{availableIds.has('codex') ? '' : ' — not on PATH'}
            </option>
            <option value="grok">
              Grok{availableIds.has('grok') ? '' : ' — not on PATH'}
            </option>
          </select>
        </label>

        <label className="review-control">
          <span>Model</span>
          <input
            list="review-model-presets"
            value={settings.model}
            placeholder="CLI default"
            onChange={(e) => updateSettings({ model: e.target.value })}
            spellCheck={false}
          />
          <datalist id="review-model-presets">
            {modelPresets.map((m) => (
              <option key={m || 'default'} value={m}>
                {modelLabel(m)}
              </option>
            ))}
          </datalist>
        </label>

        <label className="review-control">
          <span>Think</span>
          <select
            value={settings.effort}
            onChange={(e) =>
              updateSettings({ effort: e.target.value as ReviewEffort })
            }
          >
            {EFFORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {settingsReady && config && (
        <p className="review-config" role="status">
          {selectedMissing ? (
            <>
              Selected CLI not detected — Run coach will fall back to API key or
              copy-prompt.
            </>
          ) : config.cliConfigured || config.llmConfigured ? (
            <>
              Ready
              {config.cliConfigured ? (
                <>
                  {' '}
                  · CLI <code>{config.cliId}</code>
                </>
              ) : (
                <> · API key</>
              )}
              {settings.model.trim() ? (
                <>
                  {' '}
                  · model <code>{settings.model.trim()}</code>
                </>
              ) : null}
              {settings.effort !== 'default' ? (
                <>
                  {' '}
                  · think <code>{settings.effort}</code>
                </>
              ) : null}
            </>
          ) : (
            <>
              No CLI / API key — copy the shared prompt into Cursor, paste the
              reply here, or install <code>claude</code> / <code>codex</code> /{' '}
              <code>grok</code>.
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
          onClick={() => void onRun()}
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
