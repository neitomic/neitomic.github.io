# neitomic local editor

Local-only writing app for this Jekyll site. It runs on your machine against the real git checkout — **no cloud, no accounts, no tokens in the app**.

Current milestones in-tree: **M0–M6** (v1 complete on the `editor-v1` integration branch).

## Requirements

- Node.js 20+ (22 recommended)
- `git` on `PATH`
- This repo checked out (default `repoRoot` is the git toplevel)

## Run

From the **repo root** (needs [`just`](https://github.com/casey/just)):

```bash
just editor
```

Or without Just:

```bash
cd tools/editor
npm install
npm run dev
```

That starts:

| Process | Address |
| --- | --- |
| Vite UI | `http://127.0.0.1:5173` |
| Hono API | `http://127.0.0.1:8787` (proxied as `/api` from Vite) |

Both bind **`127.0.0.1` only**.

Open the UI: library of `_posts/`, open a post. Default writing state is **Focus** (iA-quiet): chrome collapses, active line is emphasized, calm measure (~65ch). **Esc** or **Exit focus** restores library / metadata chrome in one action. **Preview** (after exiting focus) shows a live markdown-it side pane. **Source** toggles the full raw file including frontmatter. Save / autosave stay lossless. **New post** scaffolds `YYYY-MM-DD-slug.md` with `layout`, `title`, `date` (+0700), `tags`.

**Images:** drop or paste PNG/JPEG (also GIF/WebP) into the editor → copied to `assets/images/YYYY/` → inserts `![](/assets/images/YYYY/…)`. Preview serves `/assets/...` from this checkout via the local API.

**Publish:** **Publish…** opens a sheet with git status, diff peek, commit message (default `Add/Update post: {title}`), and **Commit & push to GitHub Pages**. Uses system `git` on your machine (SSH/credential helper) — no tokens in the app. If push fails after commit, the UI says so and never claims published.

## Tests

```bash
just editor-test
# or: cd tools/editor && npm test
```

Other recipes from the repo root: `just editor-install`, `just editor-build`, `just editor-clean` (see root `justfile`).

Golden-file check: for every file in `_posts/`, parse → serialize with no edits → **byte-identical** to the original.

## `repoRoot` default

```bash
git rev-parse --show-toplevel
```

Override: `EDITOR_REPO_ROOT=/absolute/path/to/neitomic.github.io npm run dev`

Optional API port: `EDITOR_API_PORT=8787`.

## API

- `GET /api/health` — liveness
- `GET /api/repo` — `{ repoRoot, branch, postsExists, gitOk, error? }`
- `GET /api/posts` — list posts
- `GET /api/posts/:filename` — open one post (title, body, frontmatter, raw)
- `PUT /api/posts/:filename` — save `{ title, body }` (stable frontmatter; no-edit saves keep exact bytes) or `{ raw }` for Source mode
- `POST /api/posts` — create `{ title, slug?, datePrefix? }`
- `POST /api/assets` — multipart `file` → write under `assets/images/YYYY/`, returns `{ path: "/assets/..." }`
- `GET /api/git/status?post=` — porcelain status + suggested `_posts`/`assets` paths
- `POST /api/git/diff` — `{ paths }` → unified diff peek
- `POST /api/git/publish` — `{ paths, message }` → stage/commit/push via system `git`

## Jekyll

`tools/`, `node_modules`, and Node lock/manifest files are in `_config.yml` `exclude`.
