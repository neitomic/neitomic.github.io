# neitomic local editor

Local-only writing app for this Jekyll site. It runs on your machine against the real git checkout — **no cloud, no accounts, no tokens in the app**.

Current milestones in-tree: **M0–M4** (repo bind, library/save, CodeMirror 6, live preview, focus/typewriter chrome). Later: `/assets/...` image drop-to-disk, git commit/push UI.

## Requirements

- Node.js 20+ (22 recommended)
- `git` on `PATH`
- This repo checked out (default `repoRoot` is the git toplevel)

## Run

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

`/assets/...` in preview is served from this checkout (proxied via the local API).

## Tests

```bash
npm test
```

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

## Image paths (later)

Site-root `/assets/...` (not wired yet).

## Jekyll

`tools/`, `node_modules`, and Node lock/manifest files are in `_config.yml` `exclude`.
