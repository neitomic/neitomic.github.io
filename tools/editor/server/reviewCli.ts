import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'

/** Supported local coding-agent CLIs for on-demand writing review. */
export type ReviewCliId = 'claude' | 'codex' | 'grok'

export type DetectedCli = {
  id: ReviewCliId
  binary: string
  /** Absolute path when resolved; otherwise the bare command name. */
  resolvedPath: string | null
}

export type ReviewCliConfig = {
  /** auto | off | claude | codex | grok */
  preference: 'auto' | 'off' | ReviewCliId
  /** Optional absolute/relative override for the binary. */
  binaryOverride: string | null
  /** First preferred CLI that exists on PATH (or override), else null. */
  selected: DetectedCli | null
  /** All detected CLIs in preference order. */
  available: DetectedCli[]
}

const DEFAULT_ORDER: ReviewCliId[] = ['claude', 'codex', 'grok']

const BINARY_NAMES: Record<ReviewCliId, string[]> = {
  claude: ['claude'],
  codex: ['codex'],
  grok: ['grok'],
}

export function getReviewCliPreference(): ReviewCliConfig['preference'] {
  const raw = process.env.EDITOR_REVIEW_CLI?.trim().toLowerCase()
  if (!raw || raw === 'auto') return 'auto'
  if (raw === 'off' || raw === 'none' || raw === 'false') return 'off'
  if (raw === 'claude' || raw === 'codex' || raw === 'grok') return raw
  return 'auto'
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Resolve a command name against PATH (or return absolute path if given). */
export async function whichBinary(command: string): Promise<string | null> {
  if (!command.trim()) return null
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return (await isExecutable(command)) ? command : null
  }
  const pathEnv = process.env.PATH || ''
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, command)
    if (await isExecutable(candidate)) return candidate
  }
  return null
}

export async function detectReviewClis(
  preference: ReviewCliConfig['preference'] = getReviewCliPreference(),
  binaryOverride: string | null = process.env.EDITOR_REVIEW_CLI_PATH?.trim() || null,
): Promise<ReviewCliConfig> {
  if (preference === 'off') {
    return {
      preference,
      binaryOverride,
      selected: null,
      available: [],
    }
  }

  const order: ReviewCliId[] =
    preference === 'auto' ? DEFAULT_ORDER : [preference]

  const available: DetectedCli[] = []

  if (binaryOverride) {
    const resolved = await whichBinary(binaryOverride)
    if (resolved) {
      const id: ReviewCliId =
        preference === 'auto' ? guessCliIdFromPath(resolved) : preference
      available.push({ id, binary: binaryOverride, resolvedPath: resolved })
    }
  }

  for (const id of order) {
    if (available.some((c) => c.id === id)) continue
    for (const name of BINARY_NAMES[id]) {
      const resolved = await whichBinary(name)
      if (resolved) {
        available.push({ id, binary: name, resolvedPath: resolved })
        break
      }
    }
  }

  const selected = available[0] ?? null
  return { preference, binaryOverride, selected, available }
}

function guessCliIdFromPath(resolved: string): ReviewCliId {
  const base = path.basename(resolved).toLowerCase()
  if (base.includes('codex')) return 'codex'
  if (base.includes('grok')) return 'grok'
  return 'claude'
}

export type ReviewEffortLevel =
  | 'default'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type CliRunOptions = {
  cwd?: string
  timeoutMs?: number
  /** Model id/alias; empty/undefined → CLI default. */
  model?: string | null
  /** Think / reasoning effort; `default` or empty → omit flag. */
  effort?: ReviewEffortLevel | string | null
}

export type CliRunResult = {
  cli: ReviewCliId
  binary: string
  review: string
  stderr: string
  model: string | null
  effort: string | null
  args: string[]
}

/** Normalize effort for a given CLI (skip unsupported / default). */
export function normalizeEffortForCli(
  cli: ReviewCliId,
  effort: string | null | undefined,
): string | null {
  const raw = (effort ?? '').trim().toLowerCase()
  if (!raw || raw === 'default') return null

  if (cli === 'claude') {
    // Claude --effort: low | medium | high | xhigh | max | ultracode
    if (raw === 'minimal') return 'low'
    if (
      raw === 'low' ||
      raw === 'medium' ||
      raw === 'high' ||
      raw === 'xhigh' ||
      raw === 'max' ||
      raw === 'ultracode'
    ) {
      return raw
    }
    return null
  }

  if (cli === 'codex') {
    // model_reasoning_effort: minimal | low | medium | high | xhigh (max→xhigh)
    if (raw === 'max') return 'xhigh'
    if (
      raw === 'minimal' ||
      raw === 'low' ||
      raw === 'medium' ||
      raw === 'high' ||
      raw === 'xhigh'
    ) {
      return raw
    }
    return null
  }

  // grok --effort / --reasoning-effort
  if (raw === 'ultracode') return 'xhigh'
  if (
    raw === 'none' ||
    raw === 'minimal' ||
    raw === 'low' ||
    raw === 'medium' ||
    raw === 'high' ||
    raw === 'xhigh' ||
    raw === 'max'
  ) {
    return raw
  }
  return null
}

/**
 * Build argv for a CLI coach run (excluding the binary).
 * Prompt placement: claude/codex may use argv or stdin; grok uses --prompt-file.
 */
export function buildCoachCliArgs(
  cli: ReviewCliId,
  filledPrompt: string,
  options: { model?: string | null; effort?: string | null; promptFile?: string } = {},
): { args: string[]; stdin: string | null; model: string | null; effort: string | null } {
  const model = options.model?.trim() || null
  const effort = normalizeEffortForCli(cli, options.effort)
  const args: string[] = []

  if (cli === 'claude') {
    args.push('-p', '--output-format', 'text')
    if (model) args.push('--model', model)
    if (effort) args.push('--effort', effort)
    if (filledPrompt.length < 100_000) {
      args.push(filledPrompt)
      return { args, stdin: null, model, effort }
    }
    return { args, stdin: filledPrompt, model, effort }
  }

  if (cli === 'codex') {
    args.push('exec', '--ephemeral')
    if (model) args.push('--model', model)
    if (effort) args.push('-c', `model_reasoning_effort=${effort}`)
    args.push('-')
    return { args, stdin: filledPrompt, model, effort }
  }

  // grok
  args.push('-p')
  if (options.promptFile) {
    args.push('--prompt-file', options.promptFile)
  } else {
    args.push(filledPrompt)
  }
  args.push('--output-format', 'plain')
  if (model) args.push('--model', model)
  if (effort) args.push('--effort', effort)
  return { args, stdin: null, model, effort }
}

type SpawnResult = { code: number | null; stdout: string; stderr: string }

function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; stdin?: string; timeoutMs?: number },
): Promise<SpawnResult> {
  const timeoutMs = options.timeoutMs ?? 180_000
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`Review CLI timed out after ${timeoutMs}ms (${command})`))
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })

    if (options.stdin != null) {
      child.stdin.write(options.stdin)
    }
    child.stdin.end()
  })
}

/**
 * Invoke a detected CLI with the filled coach prompt.
 * Uses stdin / prompt-file so long posts stay under argv limits.
 */
export async function runCoachCli(
  filledPrompt: string,
  cli: DetectedCli,
  options: CliRunOptions = {},
): Promise<CliRunResult> {
  const binary = cli.resolvedPath || cli.binary
  const cwd = options.cwd
  const timeoutMs = options.timeoutMs

  let tmpDir: string | null = null
  try {
    let promptFile: string | undefined
    if (cli.id === 'grok') {
      tmpDir = await mkdtemp(path.join(os.tmpdir(), 'editor-review-'))
      promptFile = path.join(tmpDir, 'coach-prompt.md')
      await writeFile(promptFile, filledPrompt, 'utf8')
    }

    const built = buildCoachCliArgs(cli.id, filledPrompt, {
      model: options.model,
      effort: options.effort,
      promptFile,
    })

    const result = await runProcess(binary, built.args, {
      cwd,
      stdin: built.stdin ?? undefined,
      timeoutMs,
    })

    const review = result.stdout.trim()
    if (result.code !== 0) {
      const detail = result.stderr.trim() || review || `exit ${result.code}`
      throw new Error(`${cli.id} CLI failed: ${detail}`)
    }
    if (!review) {
      const detail = result.stderr.trim() || 'empty stdout'
      throw new Error(`${cli.id} CLI returned no review text (${detail})`)
    }

    return {
      cli: cli.id,
      // Prefer the short command name for UI; keep resolved path only for errors.
      binary: cli.binary,
      review,
      stderr: result.stderr.trim(),
      model: built.model,
      effort: built.effort,
      args: built.args,
    }
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {
        /* ignore */
      })
    }
  }
}

/** Fixed coach headings from tools/editor/prompts/writing-coach.md */
export const COACH_SECTION_IDS = [
  'structure',
  'coverage',
  'clarity',
  'grammar',
] as const

export type CoachSectionId = (typeof COACH_SECTION_IDS)[number]

export type CoachSection = {
  id: CoachSectionId | 'other'
  title: string
  body: string
}

const HEADING_MAP: Array<{ id: CoachSectionId; pattern: RegExp; title: string }> = [
  { id: 'structure', pattern: /^#{2,3}\s*Structure\s*$/i, title: 'Structure' },
  {
    id: 'coverage',
    pattern: /^#{2,3}\s*Coverage gaps\s*$/i,
    title: 'Coverage gaps',
  },
  { id: 'clarity', pattern: /^#{2,3}\s*Clarity\s*$/i, title: 'Clarity' },
  {
    id: 'grammar',
    pattern: /^#{2,3}\s*Grammar appendix(?:\s*\(optional\))?\s*$/i,
    title: 'Grammar appendix',
  },
]

/**
 * Split coach Markdown into Structure / Coverage / Clarity / Grammar sections.
 * Returns a single "other" section when headings are missing (still showable).
 */
export function parseCoachReview(markdown: string): CoachSection[] {
  const text = markdown.replace(/^\uFEFF/, '').trim()
  if (!text) return []

  const lines = text.split(/\r?\n/)
  const sections: CoachSection[] = []
  let current: CoachSection | null = null
  const preface: string[] = []

  function pushCurrent() {
    if (!current) return
    current.body = current.body.replace(/\s+$/, '')
    if (current.body || current.id !== 'other') sections.push(current)
    current = null
  }

  for (const line of lines) {
    const matched = HEADING_MAP.find((h) => h.pattern.test(line.trim()))
    if (matched) {
      pushCurrent()
      if (preface.length && sections.length === 0) {
        const intro = preface.join('\n').trim()
        if (intro) {
          sections.push({ id: 'other', title: 'Notes', body: intro })
        }
        preface.length = 0
      }
      current = { id: matched.id, title: matched.title, body: '' }
      continue
    }
    if (!current) {
      preface.push(line)
      continue
    }
    current.body += (current.body ? '\n' : '') + line
  }
  pushCurrent()

  if (sections.length === 0) {
    return [{ id: 'other', title: 'Review', body: text }]
  }

  // Drop empty optional grammar
  return sections.filter(
    (s) => s.id !== 'grammar' || s.body.trim().length > 0,
  )
}
