import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolveRepoRoot } from './repo.ts'

const execFileAsync = promisify(execFile)

export type GitFileStatus = {
  path: string
  /** Short porcelain-ish code, e.g. M, A, ??, D */
  code: string
}

export type GitStatus = {
  branch: string | null
  clean: boolean
  files: GitFileStatus[]
  /** Subset relevant to publishing posts/assets */
  publishable: GitFileStatus[]
}

export type GitDiff = {
  paths: string[]
  patch: string
}

export type PublishResult = {
  ok: boolean
  committed: boolean
  pushed: boolean
  commitSha: string | null
  message: string
  staged: string[]
  stdout: string
  stderr: string
  error?: string
}

async function git(
  repoRoot: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return { stdout: stdout.toString(), stderr: stderr.toString(), code: 0 }
  } catch (err) {
    const e = err as {
      stdout?: string | Buffer
      stderr?: string | Buffer
      code?: number
      message?: string
    }
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() || e.message || String(err),
      code: typeof e.code === 'number' ? e.code : 1,
    }
  }
}

/** Only allow staging/diffing posts and assets — never arbitrary repo paths. */
export function assertPublishPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (
    normalized.includes('\0') ||
    normalized.includes('..') ||
    path.isAbsolute(normalized)
  ) {
    throw new Error('Invalid path')
  }
  if (normalized.startsWith('_posts/')) {
    if (!/^_posts\/[^/]+\.md$/.test(normalized)) {
      throw new Error('Only markdown files directly under _posts/ may be published')
    }
    return normalized
  }
  if (normalized.startsWith('assets/')) {
    const parts = normalized.split('/')
    if (parts.some((p) => !p || p === '.' || p === '..')) {
      throw new Error('Invalid asset path')
    }
    return normalized
  }
  throw new Error('Only _posts/ and assets/ paths can be staged for publish')
}

function isPublishable(relPath: string): boolean {
  try {
    assertPublishPath(relPath)
    return true
  } catch {
    return false
  }
}

function parsePorcelain(stdout: string): GitFileStatus[] {
  const files: GitFileStatus[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    // porcelain v1: XY PATH or XY ORIG -> PATH
    const code = line.slice(0, 2).trim() || line.slice(0, 2)
    let filePath = line.slice(3)
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop() ?? filePath
    }
    files.push({ path: filePath, code })
  }
  return files
}

export async function getGitStatus(): Promise<GitStatus> {
  const root = await resolveRepoRoot()
  const branchRes = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const statusRes = await git(root, ['status', '--porcelain'])
  if (statusRes.code !== 0) {
    throw new Error(statusRes.stderr || 'git status failed')
  }
  const files = parsePorcelain(statusRes.stdout)
  const publishable = files.filter((f) => isPublishable(f.path))
  return {
    branch: branchRes.code === 0 ? branchRes.stdout.trim() : null,
    clean: files.length === 0,
    files,
    publishable,
  }
}

export async function getGitDiff(paths: string[]): Promise<GitDiff> {
  const root = await resolveRepoRoot()
  const safe = paths.map(assertPublishPath)
  if (!safe.length) {
    return { paths: [], patch: '' }
  }

  // Untracked files need /dev/null diff; tracked use git diff HEAD
  const status = await getGitStatus()
  const byPath = new Map(status.files.map((f) => [f.path, f]))
  const patches: string[] = []

  for (const p of safe) {
    const st = byPath.get(p)
    if (!st) {
      continue
    }
    if (st.code.includes('?')) {
      const res = await git(root, [
        'diff',
        '--no-index',
        '--',
        '/dev/null',
        p,
      ])
      // git diff --no-index returns 1 when differences exist
      if (res.stdout.trim()) patches.push(res.stdout)
      else if (res.stderr.trim() && res.code > 1) {
        throw new Error(res.stderr)
      }
    } else {
      const res = await git(root, ['diff', 'HEAD', '--', p])
      if (res.code !== 0 && !res.stdout) {
        throw new Error(res.stderr || `git diff failed for ${p}`)
      }
      if (res.stdout.trim()) patches.push(res.stdout)
      // Also include staged diff if any
      const staged = await git(root, ['diff', '--cached', '--', p])
      if (staged.stdout.trim()) patches.push(staged.stdout)
    }
  }

  return { paths: safe, patch: patches.join('\n') }
}

export function defaultCommitMessage(
  title: string,
  postPath: string,
  status: GitStatus,
): string {
  const cleanTitle = title.trim() || path.basename(postPath, '.md')
  const entry = status.files.find((f) => f.path === postPath)
  // Missing from status ⇒ already matches HEAD (tracked) → Update
  const isNew =
    !!entry && (entry.code.includes('?') || entry.code.includes('A'))
  return isNew ? `Add post: ${cleanTitle}` : `Update post: ${cleanTitle}`
}

/**
 * Stage selected paths, commit, and push with system git.
 * Never reports success for push if push failed — even if commit succeeded.
 */
export async function publishPaths(input: {
  paths: string[]
  message: string
}): Promise<PublishResult> {
  const root = await resolveRepoRoot()
  const message = input.message.trim()
  if (!message) {
    throw new Error('Commit message is required')
  }
  if (!input.paths.length) {
    throw new Error('No paths to publish')
  }
  const staged = input.paths.map(assertPublishPath)

  const add = await git(root, ['add', '--', ...staged])
  if (add.code !== 0) {
    return {
      ok: false,
      committed: false,
      pushed: false,
      commitSha: null,
      message,
      staged,
      stdout: add.stdout,
      stderr: add.stderr,
      error: add.stderr || 'git add failed',
    }
  }

  const commit = await git(root, ['commit', '-m', message, '--', ...staged])
  if (commit.code !== 0) {
    const nothing =
      /nothing to commit|no changes added/i.test(commit.stdout) ||
      /nothing to commit|no changes added/i.test(commit.stderr)
    if (!nothing) {
      return {
        ok: false,
        committed: false,
        pushed: false,
        commitSha: null,
        message,
        staged,
        stdout: commit.stdout,
        stderr: commit.stderr,
        error: commit.stderr || commit.stdout || 'git commit failed',
      }
    }
    // Already committed (e.g. prior push failure) — still attempt push.
    // Confirm staged paths are no longer dirty; otherwise refuse.
    const after = await getGitStatus()
    const stillDirty = staged.some((p) =>
      after.files.some((f) => f.path === p),
    )
    if (stillDirty) {
      return {
        ok: false,
        committed: false,
        pushed: false,
        commitSha: null,
        message,
        staged,
        stdout: commit.stdout,
        stderr: commit.stderr,
        error:
          'Nothing to commit — save the post (and assets) first, or already committed',
      }
    }
  }

  const shaRes = await git(root, ['rev-parse', 'HEAD'])
  const commitSha = shaRes.code === 0 ? shaRes.stdout.trim() : null

  const push = await git(root, ['push'])
  const outParts = [commit.stdout, push.stdout].filter(Boolean)
  const errParts = [commit.stderr, push.stderr].filter(Boolean)
  if (push.code !== 0) {
    return {
      ok: false,
      committed: true,
      pushed: false,
      commitSha,
      message,
      staged,
      stdout: outParts.join('\n'),
      stderr: errParts.join('\n'),
      error:
        push.stderr ||
        'Commit succeeded but push failed — not published to GitHub Pages',
    }
  }

  return {
    ok: true,
    committed: true,
    pushed: true,
    commitSha,
    message,
    staged,
    stdout: outParts.join('\n'),
    stderr: errParts.join('\n'),
  }
}

/** Suggest paths to stage for a post: always the post file + dirty assets/. */
export function suggestPublishPaths(
  postFilename: string,
  status: GitStatus,
): string[] {
  const postPath = assertPublishPath(`_posts/${path.basename(postFilename)}`)
  const paths = new Set<string>([postPath])
  for (const f of status.publishable) {
    if (f.path.startsWith('assets/')) paths.add(f.path)
  }
  return [...paths]
}
