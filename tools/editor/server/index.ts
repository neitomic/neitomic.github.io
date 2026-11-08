import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getRepoInfo } from './repo.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.EDITOR_API_PORT ?? 8787)

const app = new Hono()

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

console.log(`[editor-api] listening on http://${HOST}:${PORT} (local only)`)

serve({
  fetch: app.fetch,
  hostname: HOST,
  port: PORT,
})
