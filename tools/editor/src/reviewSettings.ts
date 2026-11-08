import type { ReviewCliId } from './api'

export type ReviewEffort =
  | 'default'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type ReviewPanelSettings = {
  cli: ReviewCliId | 'auto'
  model: string
  effort: ReviewEffort
}

const STORAGE_KEY = 'neitomic.editor.reviewSettings.v1'

export const EFFORT_OPTIONS: Array<{ value: ReviewEffort; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' },
]

/** Suggested model ids/aliases per CLI (empty string = CLI default). */
export const MODEL_PRESETS: Record<ReviewCliId, string[]> = {
  claude: ['', 'sonnet', 'opus', 'haiku', 'fable'],
  codex: ['', 'gpt-5.4', 'gpt-5.3-codex', 'o4-mini'],
  grok: ['', 'grok-4', 'grok-4.6', 'grok-3'],
}

export const DEFAULT_REVIEW_SETTINGS: ReviewPanelSettings = {
  cli: 'auto',
  model: '',
  effort: 'medium',
}

function isCli(value: unknown): value is ReviewCliId | 'auto' {
  return (
    value === 'auto' ||
    value === 'claude' ||
    value === 'codex' ||
    value === 'grok'
  )
}

function isEffort(value: unknown): value is ReviewEffort {
  return EFFORT_OPTIONS.some((o) => o.value === value)
}

export function loadReviewSettings(): ReviewPanelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_REVIEW_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ReviewPanelSettings>
    return {
      cli: isCli(parsed.cli) ? parsed.cli : DEFAULT_REVIEW_SETTINGS.cli,
      model:
        typeof parsed.model === 'string'
          ? parsed.model
          : DEFAULT_REVIEW_SETTINGS.model,
      effort: isEffort(parsed.effort)
        ? parsed.effort
        : DEFAULT_REVIEW_SETTINGS.effort,
    }
  } catch {
    return { ...DEFAULT_REVIEW_SETTINGS }
  }
}

export function saveReviewSettings(settings: ReviewPanelSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* private mode / quota — ignore */
  }
}

export function modelLabel(model: string): string {
  return model.trim() === '' ? 'CLI default' : model.trim()
}
