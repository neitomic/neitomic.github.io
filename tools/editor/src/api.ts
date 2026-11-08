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
