import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

export type RepoInfo = {
  repoRoot: string
  branch: string | null
  postsExists: boolean
  gitOk: boolean
  error?: string
}

/**
 * Default repoRoot: git toplevel of this checkout when launched from tools/editor.
 * Override with EDITOR_REPO_ROOT (absolute or relative to process cwd).
 */
export async function resolveRepoRoot(): Promise<string> {
  if (process.env.EDITOR_REPO_ROOT) {
    return path.resolve(process.env.EDITOR_REPO_ROOT)
  }

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
    })
    return stdout.trim()
  } catch {
    // server/ lives at tools/editor/server → two levels up is the Jekyll repo root
    const here = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(here, '../..')
  }
}

export async function getRepoInfo(): Promise<RepoInfo> {
  const repoRoot = await resolveRepoRoot()
  let branch: string | null = null
  let gitOk = false
  let error: string | undefined

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: repoRoot },
    )
    branch = stdout.trim()
    gitOk = true
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const postsDir = path.join(repoRoot, '_posts')
  let postsExists = false
  try {
    const st = await fs.stat(postsDir)
    postsExists = st.isDirectory()
  } catch {
    postsExists = false
  }

  return { repoRoot, branch, postsExists, gitOk, error }
}
