# neitomic local editor (M0)

Local-only writing app scaffold for this Jekyll site. It runs on your machine against the real git checkout — **no cloud, no accounts, no tokens in the app**.

Later milestones will open/save `_posts/`, preview Markdown, drop images under `/assets/...`, and publish by shelling out to system `git`. This milestone only binds the repo and proves the API + UI loop.

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

Both bind **`127.0.0.1` only** — not reachable from other machines on the network.

Open the UI URL. You should see health status plus `repoRoot`, branch, whether `_posts/` exists, and whether git looks OK.

## `repoRoot` default

When launched from `tools/editor` (or anywhere inside this checkout), the API resolves `repoRoot` via:

```bash
git rev-parse --show-toplevel
```

So from `tools/editor` that is the Jekyll repo root (two levels up), not `tools/editor` itself.

Override if needed:

```bash
EDITOR_REPO_ROOT=/absolute/path/to/neitomic.github.io npm run dev
```

Optional API port override: `EDITOR_API_PORT=8787` (Vite proxy reads the same env at config load time).

## API (M0)

- `GET /api/health` — liveness JSON (`ok`, bind info)
- `GET /api/repo` — `{ repoRoot, branch, postsExists, gitOk, error? }`

## Out of scope (later)

CodeMirror, open/save posts, preview, focus mode, image ingest, commit/push UI.

## Jekyll

`tools/`, `node_modules`, and Node lock/manifest files are listed in the site `_config.yml` `exclude` so this app is never built into GitHub Pages.
