#!/usr/bin/env npx tsx
/**
 * Fill the shared writing-coach prompt for a _posts file.
 * Usage (from repo root): just review-post FILE=_posts/YYYY-MM-DD-slug.md
 * Optional LLM: EDITOR_REVIEW_API_KEY=… just review-post FILE=… --run
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import {
  buildFilledPrompt,
  getReviewLlmConfig,
  runCoachLlm,
} from '../server/review.ts'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

function usage(): never {
  console.error(`Usage: review-post [--run] <path-to-post.md>

Fills tools/editor/prompts/writing-coach.md with path, title, and body.
Prints the prompt to stdout. With --run and EDITOR_REVIEW_API_KEY / OPENAI_API_KEY,
prints prompt, then ---, then the LLM review.

Examples:
  just review-post FILE=_posts/2026-11-08-my-personal-gist-inbox.md
  EDITOR_REVIEW_API_KEY=sk-... just review-post FILE=_posts/... --run
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

  const cfg = getReviewLlmConfig()
  if (!cfg.configured) {
    console.error(
      'No EDITOR_REVIEW_API_KEY / OPENAI_API_KEY — printing prompt only.',
    )
    process.stdout.write(prompt.endsWith('\n') ? prompt : `${prompt}\n`)
    process.exit(1)
  }

  const review = await runCoachLlm(prompt, cfg)
  process.stdout.write(prompt.endsWith('\n') ? prompt : `${prompt}\n`)
  process.stdout.write('\n---\n\n')
  process.stdout.write(review.endsWith('\n') ? review : `${review}\n`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
