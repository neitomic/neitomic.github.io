import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const PROMPT_PATH = path.resolve(HERE, '../prompts/writing-coach.md')

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

export function publicReviewConfig() {
  const cfg = getReviewLlmConfig()
  return {
    llmConfigured: cfg.configured,
    model: cfg.configured ? cfg.model : null,
    baseUrl: cfg.configured ? cfg.baseUrl : null,
    envHint:
      'Set EDITOR_REVIEW_API_KEY (or OPENAI_API_KEY) in the shell that runs `just editor`. Optional: EDITOR_REVIEW_API_BASE, EDITOR_REVIEW_MODEL.',
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
