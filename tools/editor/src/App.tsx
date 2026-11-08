import { useEffect, useState } from 'react'
import './App.css'

type Health = {
  ok: boolean
  service?: string
  bind?: string
}

type RepoInfo = {
  repoRoot: string
  branch: string | null
  postsExists: boolean
  gitOk: boolean
  error?: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; health: Health; repo: RepoInfo }
  | { status: 'error'; message: string }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [health, repo] = await Promise.all([
          fetchJson<Health>('/api/health'),
          fetchJson<RepoInfo>('/api/repo'),
        ])
        if (!cancelled) {
          setState({ status: 'ready', health, repo })
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="shell">
      <header className="brand">
        <p className="eyebrow">neitomic.xyz</p>
        <h1>Local editor</h1>
        <p className="lede">
          M0 skeleton — binds this checkout and checks git / <code>_posts/</code>.
          Localhost only; no cloud.
        </p>
      </header>

      {state.status === 'loading' && <p className="status">Checking API…</p>}

      {state.status === 'error' && (
        <section className="panel error" aria-live="polite">
          <h2>Could not reach API</h2>
          <p>{state.message}</p>
          <p className="hint">
            Run <code>npm run dev</code> from <code>tools/editor</code> so the UI and
            API start together.
          </p>
        </section>
      )}

      {state.status === 'ready' && (
        <>
          <section className="panel" aria-labelledby="health-heading">
            <h2 id="health-heading">Health</h2>
            <dl>
              <div>
                <dt>Status</dt>
                <dd className={state.health.ok ? 'ok' : 'bad'}>
                  {state.health.ok ? 'ok' : 'fail'}
                </dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{state.health.service ?? '—'}</dd>
              </div>
              <div>
                <dt>Bind</dt>
                <dd>
                  <code>{state.health.bind ?? '—'}</code>
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel" aria-labelledby="repo-heading">
            <h2 id="repo-heading">Repo</h2>
            <dl>
              <div>
                <dt>repoRoot</dt>
                <dd>
                  <code>{state.repo.repoRoot}</code>
                </dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>
                  {state.repo.branch ? (
                    <code>{state.repo.branch}</code>
                  ) : (
                    <span className="bad">unknown</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>git ok</dt>
                <dd className={state.repo.gitOk ? 'ok' : 'bad'}>
                  {state.repo.gitOk ? 'yes' : 'no'}
                </dd>
              </div>
              <div>
                <dt>_posts/</dt>
                <dd className={state.repo.postsExists ? 'ok' : 'bad'}>
                  {state.repo.postsExists ? 'found' : 'missing'}
                </dd>
              </div>
            </dl>
            {state.repo.error && (
              <p className="hint error-text">{state.repo.error}</p>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export default App
