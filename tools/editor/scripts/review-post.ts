#!/usr/bin/env npx tsx
/**
 * Fill the shared writing-coach prompt for a _posts file.
 * Usage (from repo root): just review-post FILE=_posts/YYYY-MM-DD-slug.md
 * Optional run: prefers local claude/codex/grok CLI, else EDITOR_REVIEW_API_KEY.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { buildFilledPrompt, runCoachReview } from '../server/review.ts'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

function usage(): never {
  console.error(`Usage: review-post [--run] <path-to-post.md>

Fills tools/editor/prompts/writing-coach.md with path, title, and body.
Prints the prompt to stdout. With --run, prefers a local CLI (claude / codex / grok),
then EDITOR_REVIEW_API_KEY / OPENAI_API_KEY; prints prompt, then ---, then the review.

Examples:
  just review-post FILE=_posts/2026-11-08-my-personal-gist-inbox.md
  just review-post FILE=_posts/... -- --run
  EDITOR_REVIEW_CLI=claude just review-post FILE=_posts/... -- --run
`)
  process.exit(2)
}

async function resolvePostFile(fileArg: string): Promise<string> {
  const candidates = [
    path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg),
    path.resolve(REPO_ROOT, fileArg),
  ]
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error(`Post not found: ${fileArg}`)
}

function displayRepoPath(absPath: string): string {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/')
  if (rel && !rel.startsWith('..')) return rel
  return path.basename(absPath)
}

async function main() {
  const args = process.argv.slice(2)
  const run = args.includes('--run')
  const fileArg = args.find((a) => a !== '--run' && a !== '--')
  if (!fileArg) usage()

  const abs = await resolvePostFile(fileArg)
  const raw = await readFile(abs, 'utf8')
  const parsed = matter(raw)
  const title =
    typeof parsed.data.title === 'string' ? parsed.data.title : ''
  const body = parsed.content.replace(/^\n/, '')
  const postPath = displayRepoPath(abs)

  const prompt = await buildFilledPrompt({
    path: postPath,
    title,
    body,
  })

  if (!run) {
    process.stdout.write(prompt.endsWith('\n') ? prompt : `${prompt}\n`)
    return
  }

  const ran = await runCoachReview(prompt, { prefer: 'auto' })
  process.stdout.write(prompt.endsWith('\n') ? prompt : `${prompt}\n`)
  if (!ran.review) {
    console.error(ran.error || 'No review produced.')
    process.exit(1)
  }
  process.stdout.write('\n---\n\n')
  if (ran.mode === 'cli') {
    console.error(`[review-post] via CLI ${ran.cliId}`)
  } else if (ran.mode === 'llm') {
    console.error('[review-post] via API key')
  }
  process.stdout.write(ran.review.endsWith('\n') ? ran.review : `${ran.review}\n`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
