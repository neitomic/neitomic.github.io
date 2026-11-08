export type Health = {
  ok: boolean
  service?: string
  bind?: string
}

export type RepoInfo = {
  repoRoot: string
  branch: string | null
  postsExists: boolean
  gitOk: boolean
  error?: string
}

export type PostListItem = {
  filename: string
  title: string
  date: string | null
}

export type PostDocument = {
  filename: string
  title: string
  body: string
  layout: string
  date: string | null
  tags: string[]
  data: Record<string, unknown>
  raw: string
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    if (data.error) return data.error
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new Error(await parseError(res))
  }
  return res.json() as Promise<T>
}

export function listPosts() {
  return fetchJson<{ posts: PostListItem[] }>('/api/posts')
}

export function getPost(filename: string) {
  return fetchJson<PostDocument>(`/api/posts/${encodeURIComponent(filename)}`)
}

export function savePost(filename: string, title: string, body: string) {
  return fetchJson<PostDocument>(`/api/posts/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  })
}

export function saveRawPost(filename: string, raw: string) {
  return fetchJson<PostDocument>(`/api/posts/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
}

export function createPost(input: {
  title: string
  slug?: string
  datePrefix?: string
}) {
  return fetchJson<PostDocument>('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export type UploadedAsset = {
  path: string
  absolutePath: string
  mime: string
  bytes: number
}

export async function uploadAsset(file: File): Promise<UploadedAsset> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/assets', { method: 'POST', body: fd })
  if (!res.ok) {
    throw new Error(await parseError(res))
  }
  return res.json() as Promise<UploadedAsset>
}

export type GitFileStatus = { path: string; code: string }

export type GitStatusResponse = {
  branch: string | null
  clean: boolean
  files: GitFileStatus[]
  publishable: GitFileStatus[]
  suggested: string[]
  defaultMessage: string | null
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

export function fetchGitStatus(postFilename?: string, title?: string) {
  const params = new URLSearchParams()
  if (postFilename) params.set('post', postFilename)
  if (title != null && title !== '') params.set('title', title)
  const q = params.toString() ? `?${params}` : ''
  return fetchJson<GitStatusResponse>(`/api/git/status${q}`)
}

export function fetchGitDiff(paths: string[]) {
  return fetchJson<{ paths: string[]; patch: string }>('/api/git/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  })
}

/** Always returns the publish payload — including failed push (HTTP 409). */
export async function publishToGitHub(input: {
  paths: string[]
  message: string
  title?: string
  post?: string
}): Promise<PublishResult> {
  const res = await fetch('/api/git/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json()) as PublishResult & { error?: string }
  if (!res.ok && data.ok === undefined && data.error) {
    throw new Error(data.error)
  }
  if (!res.ok && typeof data.ok !== 'boolean') {
    throw new Error(data.error || (await parseError(res)))
  }
  return data
}

export type ReviewConfig = {
  llmConfigured: boolean
  model: string | null
  baseUrl: string | null
  envHint: string
}

export type ReviewResponse = ReviewConfig & {
  mode: 'llm' | 'prompt-only'
  prompt: string
  review: string | null
  error?: string
}

export function fetchReviewConfig() {
  return fetchJson<ReviewConfig>('/api/review/config')
}

export function requestWritingReview(input: {
  filename: string
  title: string
  body: string
  run?: boolean
}) {
  return fetchJson<ReviewResponse>('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: input.filename,
      title: input.title,
      body: input.body,
      run: input.run === true,
    }),
  })
}
