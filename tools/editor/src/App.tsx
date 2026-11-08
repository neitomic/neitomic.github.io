import { useCallback, useEffect, useState } from 'react'
import {
  fetchJson,
  getPost,
  listPosts,
  type Health,
  type PostDocument,
  type PostListItem,
  type RepoInfo,
} from './api'
import { Editor } from './Editor'
import { Library } from './Library'
import { NewPost } from './NewPost'
import './App.css'

type View =
  | { name: 'boot' }
  | { name: 'library' }
  | { name: 'new' }
  | { name: 'editor'; post: PostDocument }
  | { name: 'fatal'; message: string }

function App() {
  const [view, setView] = useState<View>({ name: 'boot' })
  const [health, setHealth] = useState<Health | null>(null)
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [posts, setPosts] = useState<PostListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const refreshPosts = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const data = await listPosts()
      setPosts(data.posts)
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const [h, r] = await Promise.all([
          fetchJson<Health>('/api/health'),
          fetchJson<RepoInfo>('/api/repo'),
        ])
        if (cancelled) return
        setHealth(h)
        setRepo(r)
        setView({ name: 'library' })
        await refreshPosts()
      } catch (err) {
        if (!cancelled) {
          setView({
            name: 'fatal',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [refreshPosts])

  async function openPost(filename: string) {
    try {
      const post = await getPost(filename)
      setView({ name: 'editor', post })
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
      setView({ name: 'library' })
    }
  }

  return (
    <main className="shell">
      {view.name === 'boot' && <p className="status">Starting…</p>}

      {view.name === 'fatal' && (
        <section className="panel error" aria-live="polite">
          <h2>Could not reach API</h2>
          <p>{view.message}</p>
          <p className="hint">
            Run <code>npm run dev</code> from <code>tools/editor</code>.
          </p>
        </section>
      )}

      {view.name === 'library' && repo && (
        <>
          <Library
            repo={repo}
            posts={posts}
            loading={listLoading}
            error={listError}
            onOpen={(f) => void openPost(f)}
            onNew={() => setView({ name: 'new' })}
            onRefresh={() => void refreshPosts()}
          />
          {health && (
            <p className="footer-meta">
              API {health.ok ? 'ok' : 'down'}
              {health.bind ? ` · ${health.bind}` : ''}
            </p>
          )}
        </>
      )}

      {view.name === 'new' && (
        <NewPost
          onCancel={() => setView({ name: 'library' })}
          onCreated={(filename) => {
            void refreshPosts().then(() => openPost(filename))
          }}
        />
      )}

      {view.name === 'editor' && (
        <Editor
          post={view.post}
          onBack={() => {
            setView({ name: 'library' })
            void refreshPosts()
          }}
          onSaved={(post) => {
            setView({ name: 'editor', post })
            void refreshPosts()
          }}
        />
      )}
    </main>
  )
}

export default App
