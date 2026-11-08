import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getRepoInfo } from './repo.ts'
import {
  createPost,
  listPosts,
  readPost,
  writePost,
} from './posts.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.EDITOR_API_PORT ?? 8787)

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  const message = err instanceof Error ? err.message : String(err)
  const status =
    /not found|ENOENT/i.test(message)
      ? 404
      : /already exists|required|must|Invalid|escapes/i.test(message)
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
  const body = await c.req.json<{ title?: string; body?: string }>()
  if (typeof body.title !== 'string' || typeof body.body !== 'string') {
    throw new HTTPException(400, { message: 'title and body strings are required' })
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

console.log(`[editor-api] listening on http://${HOST}:${PORT} (local only)`)

serve({
  fetch: app.fetch,
  hostname: HOST,
  port: PORT,
})
