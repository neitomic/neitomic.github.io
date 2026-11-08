import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { readRepoAsset, writeImageAsset } from './assets.ts'
import {
  defaultCommitMessage,
  getGitDiff,
  getGitStatus,
  publishPaths,
  suggestPublishPaths,
} from './git.ts'
import { getRepoInfo } from './repo.ts'
import {
  createPost,
  listPosts,
  readPost,
  writePost,
  writeRawPost,
} from './posts.ts'
import {
  buildFilledPrompt,
  publicReviewConfig,
  runCoachReview,
} from './review.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.EDITOR_API_PORT ?? 8787)

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  const message = err instanceof Error ? err.message : String(err)
  const status =
    /not found|ENOENT|Not a file/i.test(message)
      ? 404
      : /already exists|required|must|Invalid|escapes|Only \/assets|Unsupported|Empty image|too large|multipart|No paths|Commit message|Only _posts/i.test(
            message,
          )
        ? 400
        : 500
  return c.json({ error: message }, status)
})

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'neitomic-editor',
    bind: `${HOST}:${PORT}`,
  }),
)

app.get('/api/repo', async (c) => {
  const info = await getRepoInfo()
  return c.json(info)
})

app.post('/api/assets', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    throw new HTTPException(400, { message: 'multipart field "file" is required' })
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  const written = await writeImageAsset({
    bytes,
    mime: file.type || 'application/octet-stream',
    originalName: file.name || 'image',
  })
  return c.json(written, 201)
})

// Preview trust: serve site-root /assets/... from the Jekyll checkout.
app.get('/assets/*', async (c) => {
  const pathname = new URL(c.req.url).pathname
  try {
    const { bytes, type } = await readRepoAsset(pathname)
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/ENOENT|Not a file|no such file/i.test(message)) {
      throw new HTTPException(404, { message: 'Asset not found' })
    }
    throw err
  }
})

app.get('/api/posts', async (c) => {
  const posts = await listPosts()
  return c.json({ posts })
})

app.get('/api/posts/:filename', async (c) => {
  const filename = c.req.param('filename')
  try {
    const post = await readPost(filename)
    return c.json(post)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/ENOENT|no such file/i.test(message)) {
      throw new HTTPException(404, { message: `Post not found: ${filename}` })
    }
    throw err
  }
})

app.put('/api/posts/:filename', async (c) => {
  const filename = c.req.param('filename')
  const body = await c.req.json<{ title?: string; body?: string; raw?: string }>()
  if (typeof body.raw === 'string') {
    const post = await writeRawPost(filename, body.raw)
    return c.json(post)
  }
  if (typeof body.title !== 'string' || typeof body.body !== 'string') {
    throw new HTTPException(400, {
      message: 'Provide { title, body } or { raw }',
    })
  }
  const post = await writePost(filename, body.title, body.body)
  return c.json(post)
})

app.post('/api/posts', async (c) => {
  const body = await c.req.json<{
    title?: string
    slug?: string
    datePrefix?: string
    tags?: string[]
  }>()
  if (typeof body.title !== 'string') {
    throw new HTTPException(400, { message: 'title is required' })
  }
  const post = await createPost({
    title: body.title,
    slug: body.slug,
    datePrefix: body.datePrefix,
    tags: body.tags,
  })
  return c.json(post, 201)
})

app.get('/api/git/status', async (c) => {
  const status = await getGitStatus()
  const post = c.req.query('post')
  const title = c.req.query('title') ?? ''
  const suggested = post
    ? suggestPublishPaths(post, status)
    : status.publishable.map((f) => f.path)
  const defaultMessage =
    post != null && post !== ''
      ? defaultCommitMessage(title, `_posts/${post}`, status)
      : null
  return c.json({ ...status, suggested, defaultMessage })
})

app.post('/api/git/diff', async (c) => {
  const body = await c.req.json<{ paths?: string[] }>()
  if (!Array.isArray(body.paths)) {
    throw new HTTPException(400, { message: 'paths array is required' })
  }
  const diff = await getGitDiff(body.paths)
  return c.json(diff)
})

app.post('/api/git/publish', async (c) => {
  const body = await c.req.json<{
    paths?: string[]
    message?: string
    title?: string
    post?: string
  }>()
  if (!Array.isArray(body.paths) || typeof body.message !== 'string') {
    throw new HTTPException(400, { message: 'paths and message are required' })
  }
  // Allow empty message only if we can default from title/post
  let message = body.message.trim()
  if (!message && body.post && body.title) {
    const status = await getGitStatus()
    message = defaultCommitMessage(body.title, `_posts/${body.post}`, status)
  }
  const result = await publishPaths({ paths: body.paths, message })
  return c.json(result, result.ok ? 200 : 409)
})

/** Writing coach — local CLI preferred; optional HTTP LLM; else copy-prompt. */
app.get('/api/review/config', async (c) => c.json(await publicReviewConfig()))

app.post('/api/review', async (c) => {
  const body = await c.req.json<{
    path?: string
    filename?: string
    title?: string
    body?: string
    run?: boolean
    prefer?: 'auto' | 'cli' | 'llm'
  }>()
  const title = typeof body.title === 'string' ? body.title : ''
  const postBody = typeof body.body === 'string' ? body.body : ''
  const filename =
    typeof body.filename === 'string' && body.filename.trim()
      ? body.filename.trim()
      : ''
  const postPath =
    typeof body.path === 'string' && body.path.trim()
      ? body.path.trim()
      : filename
        ? `_posts/${filename}`
        : ''
  if (!postPath) {
    throw new HTTPException(400, {
      message: 'path or filename is required',
    })
  }

  const prompt = await buildFilledPrompt({
    path: postPath,
    title,
    body: postBody,
  })
  const cfg = await publicReviewConfig()
  const wantRun = body.run === true
  const prefer =
    body.prefer === 'cli' || body.prefer === 'llm' || body.prefer === 'auto'
      ? body.prefer
      : 'auto'

  if (!wantRun) {
    return c.json({
      mode: 'prompt-only' as const,
      prompt,
      review: null,
      sections: [],
      ...cfg,
    })
  }

  const ran = await runCoachReview(prompt, { prefer })
  return c.json({
    mode: ran.mode,
    prompt,
    review: ran.review,
    sections: ran.sections,
    error: ran.error,
    ...cfg,
    // Reflect the CLI that actually ran when present
    cliId: ran.cliId ?? cfg.cliId,
    cliBinary: ran.cliBinary ?? cfg.cliBinary,
    cliConfigured: Boolean(ran.cliId ?? cfg.cliId),
  })
})

console.log(`[editor-api] listening on http://${HOST}:${PORT} (local only)`)

serve({
  fetch: app.fetch,
  hostname: HOST,
  port: PORT,
})
