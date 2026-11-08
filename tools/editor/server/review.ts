import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  detectReviewClis,
  getReviewCliPreference,
  parseCoachReview,
  runCoachCli,
  type CoachSection,
  type DetectedCli,
  type ReviewCliId,
} from './reviewCli.ts'
import { resolveRepoRoot } from './repo.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const PROMPT_PATH = path.resolve(HERE, '../prompts/writing-coach.md')

export { parseCoachReview }
export type { CoachSection, ReviewCliId }

/** Server-side only — never expose the raw key to the UI. */
export type ReviewLlmConfig = {
  configured: boolean
  apiKey: string | null
  /** OpenAI-compatible chat completions base, e.g. https://api.openai.com/v1 */
  baseUrl: string
  model: string
}

export function getReviewLlmConfig(): ReviewLlmConfig {
  const apiKey =
    process.env.EDITOR_REVIEW_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    null
  const baseUrl = (
    process.env.EDITOR_REVIEW_API_BASE?.trim() ||
    'https://api.openai.com/v1'
  ).replace(/\/$/, '')
  const model =
    process.env.EDITOR_REVIEW_MODEL?.trim() || 'gpt-4o-mini'
  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    model,
  }
}

export type PublicReviewConfig = {
  llmConfigured: boolean
  model: string | null
  baseUrl: string | null
  envHint: string
  cliPreference: string
  cliConfigured: boolean
  cliId: ReviewCliId | null
  cliBinary: string | null
  cliAvailable: Array<{ id: ReviewCliId; binary: string }>
  /** Env defaults surfaced to the UI (not secrets). */
  envDefaults: {
    cli: string
    model: string | null
    effort: string | null
  }
}

export async function publicReviewConfig(): Promise<PublicReviewConfig> {
  const cfg = getReviewLlmConfig()
  const cli = await detectReviewClis()
  const preference = getReviewCliPreference()
  const envModel = process.env.EDITOR_REVIEW_MODEL?.trim() || null
  const envEffort = process.env.EDITOR_REVIEW_EFFORT?.trim() || null
  return {
    llmConfigured: cfg.configured,
    model: cfg.configured ? cfg.model : null,
    baseUrl: cfg.configured ? cfg.baseUrl : null,
    cliPreference: preference,
    cliConfigured: Boolean(cli.selected),
    cliId: cli.selected?.id ?? null,
    cliBinary: cli.selected?.binary ?? null,
    cliAvailable: cli.available.map((c) => ({
      id: c.id,
      binary: c.binary,
    })),
    envDefaults: {
      cli: preference,
      model: envModel,
      effort: envEffort,
    },
    envHint:
      'Panel picks CLI / model / effort (saved in localStorage). Env: EDITOR_REVIEW_CLI, EDITOR_REVIEW_MODEL, EDITOR_REVIEW_EFFORT, EDITOR_REVIEW_CLI_PATH. Fallback: EDITOR_REVIEW_API_KEY (or OPENAI_API_KEY). Or copy the shared prompt into Cursor.',
  }
}

export async function loadCoachTemplate(): Promise<string> {
  return readFile(PROMPT_PATH, 'utf8')
}

export function fillCoachPrompt(
  template: string,
  input: { path: string; title: string; body: string },
): string {
  const pathValue = input.path.trim() || '(unknown path)'
  const titleValue = input.title.trim() || '(untitled)'
  const bodyValue = input.body.replace(/\s+$/, '') || '(empty body)'
  return template
    .replaceAll('{{PATH}}', pathValue)
    .replaceAll('{{TITLE}}', titleValue)
    .replaceAll('{{BODY}}', bodyValue)
}

export async function buildFilledPrompt(input: {
  path: string
  title: string
  body: string
}): Promise<string> {
  const template = await loadCoachTemplate()
  return fillCoachPrompt(template, input)
}

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

/** Call an OpenAI-compatible chat completions endpoint with the filled coach prompt. */
export async function runCoachLlm(
  filledPrompt: string,
  cfg: ReviewLlmConfig = getReviewLlmConfig(),
): Promise<string> {
  if (!cfg.apiKey) {
    throw new Error(
      'No review API key. Set EDITOR_REVIEW_API_KEY (or OPENAI_API_KEY) in the environment.',
    )
  }

  const url = `${cfg.baseUrl}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You are a careful writing coach. Follow the user prompt’s section headings exactly. Do not rewrite the full post.',
        },
        { role: 'user', content: filledPrompt },
      ],
    }),
  })

  const raw = (await res.json()) as ChatCompletionResponse
  if (!res.ok) {
    const msg =
      raw.error?.message || `${res.status} ${res.statusText} from review API`
    throw new Error(msg)
  }
  const content = raw.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('Review API returned an empty response')
  }
  return content
}

export type CoachRunMode = 'cli' | 'llm' | 'prompt-only'

export type CoachRunResult = {
  mode: CoachRunMode
  review: string | null
  sections: CoachSection[]
  error?: string
  cliId?: ReviewCliId | null
  cliBinary?: string | null
  model?: string | null
  effort?: string | null
}

export type CoachRunRequest = {
  prefer?: 'auto' | 'cli' | 'llm'
  /** Force a specific CLI when prefer is auto/cli. */
  cli?: ReviewCliId | 'auto' | null
  model?: string | null
  effort?: string | null
}

/**
 * Prefer local Claude / Codex / Grok CLI; fall back to OpenAI-compatible HTTP;
 * otherwise prompt-only (caller shows copy-prompt UX).
 */
export async function runCoachReview(
  filledPrompt: string,
  options: CoachRunRequest = {},
): Promise<CoachRunResult> {
  const prefer = options.prefer ?? 'auto'
  const cliPreference =
    options.cli === 'claude' ||
    options.cli === 'codex' ||
    options.cli === 'grok'
      ? options.cli
      : options.cli === 'auto'
        ? 'auto'
        : getReviewCliPreference()
  const cliCfg = await detectReviewClis(cliPreference)
  const llmCfg = getReviewLlmConfig()
  const model = options.model?.trim() || null
  const effort = options.effort?.trim() || null

  const tryCli = prefer === 'cli' || prefer === 'auto'
  const tryLlm = prefer === 'llm' || prefer === 'auto'

  if (tryCli && cliCfg.selected) {
    try {
      const ran = await runCoachCli(filledPrompt, cliCfg.selected, {
        cwd: await resolveRepoRoot(),
        model,
        effort,
      })
      return {
        mode: 'cli',
        review: ran.review,
        sections: parseCoachReview(ran.review),
        cliId: ran.cli,
        cliBinary: ran.binary,
        model: ran.model,
        effort: ran.effort,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // If LLM is available, fall through; otherwise surface the CLI error.
      if (!(tryLlm && llmCfg.configured)) {
        return {
          mode: 'prompt-only',
          review: null,
          sections: [],
          error: message,
          cliId: cliCfg.selected.id,
          cliBinary: cliCfg.selected.binary,
          model,
          effort,
        }
      }
      // Keep CLI failure note while attempting LLM.
      try {
        const review = await runCoachLlm(filledPrompt, {
          ...llmCfg,
          model: model || llmCfg.model,
        })
        return {
          mode: 'llm',
          review,
          sections: parseCoachReview(review),
          error: `CLI (${cliCfg.selected.id}) failed; used API key instead. ${message}`,
          cliId: cliCfg.selected.id,
          cliBinary: cliCfg.selected.binary,
          model: model || llmCfg.model,
          effort,
        }
      } catch (llmErr) {
        const llmMessage =
          llmErr instanceof Error ? llmErr.message : String(llmErr)
        return {
          mode: 'prompt-only',
          review: null,
          sections: [],
          error: `${message} · LLM fallback also failed: ${llmMessage}`,
          cliId: cliCfg.selected.id,
          cliBinary: cliCfg.selected.binary,
          model,
          effort,
        }
      }
    }
  }

  if (tryLlm && llmCfg.configured) {
    try {
      const review = await runCoachLlm(filledPrompt, {
        ...llmCfg,
        model: model || llmCfg.model,
      })
      return {
        mode: 'llm',
        review,
        sections: parseCoachReview(review),
        cliId: cliCfg.selected?.id ?? null,
        cliBinary: cliCfg.selected?.binary ?? null,
        model: model || llmCfg.model,
        effort,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        mode: 'prompt-only',
        review: null,
        sections: [],
        error: message,
        cliId: cliCfg.selected?.id ?? null,
        cliBinary: cliCfg.selected?.binary ?? null,
        model,
        effort,
      }
    }
  }

  const wanted =
    options.cli && options.cli !== 'auto' ? options.cli : null
  return {
    mode: 'prompt-only',
    review: null,
    sections: [],
    error:
      prefer === 'cli' || wanted
        ? wanted
          ? `CLI \`${wanted}\` not found on PATH. Install it, set EDITOR_REVIEW_CLI_PATH, or pick another tool / copy the prompt.`
          : 'No Claude / Codex / Grok CLI found. Install one, set EDITOR_REVIEW_CLI_PATH, or copy the prompt.'
        : 'No local CLI (claude / codex / grok) and no EDITOR_REVIEW_API_KEY / OPENAI_API_KEY — copy the prompt into Cursor/an agent, or install a CLI / set a key and retry.',
    cliId: null,
    cliBinary: null,
    model,
    effort,
  }
}

/** Test helper: expose detect for unit tests without re-export churn. */
export async function resolveSelectedCli(): Promise<DetectedCli | null> {
  const cfg = await detectReviewClis()
  return cfg.selected
}
