import type { PostListItem, RepoInfo } from './api'

type Props = {
  repo: RepoInfo
  posts: PostListItem[]
  loading: boolean
  error: string | null
  onOpen: (filename: string) => void
  onNew: () => void
  onRefresh: () => void
}

export function Library({
  repo,
  posts,
  loading,
  error,
  onOpen,
  onNew,
  onRefresh,
}: Props) {
  return (
    <div className="library">
      <header className="brand">
        <p className="eyebrow">neitomic.xyz</p>
        <h1>Posts</h1>
        <p className="lede">
          Open a post from <code>_posts/</code>, or start a new one. Saves write real
          files; publish is still git (later).
        </p>
      </header>

      <p className="status-strip" aria-label="Repository status">
        <span>
          <code>{repo.repoRoot}</code>
        </span>
        <span className="sep">·</span>
        <span>
          {repo.branch ? <code>{repo.branch}</code> : 'no branch'}
        </span>
      </p>

      <div className="toolbar">
        <button type="button" className="primary" onClick={onNew}>
          New post
        </button>
        <button type="button" className="ghost" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && (
        <p className="hint error-text" role="alert">
          {error}
        </p>
      )}

      {loading && posts.length === 0 ? (
        <p className="status">Loading posts…</p>
      ) : posts.length === 0 ? (
        <p className="status">No posts in <code>_posts/</code> yet.</p>
      ) : (
        <ul className="post-list">
          {posts.map((post) => (
            <li key={post.filename}>
              <button
                type="button"
                className="post-row"
                onClick={() => onOpen(post.filename)}
              >
                <span className="post-title">{post.title}</span>
                <span className="post-meta">
                  <code>{post.filename}</code>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
