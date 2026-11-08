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

**Review writing (on-demand coach):** **Review writing** / **Review** opens a side panel (same split layout as **Preview**) with Structure / Coverage gaps / Clarity / optional Grammar. It does **not** lint while you type and never rewrites the file.

Run order when you click **Run coach** (or on panel open):

1. **Local CLI** — panel **CLI** control (`auto` / `claude` / `codex` / `grok`), plus **Model** and **Think** effort (persisted in `localStorage`)
2. **HTTP LLM** — `EDITOR_REVIEW_API_KEY` or `OPENAI_API_KEY` (OpenAI-compatible chat completions)
3. **Copy prompt** — copy the filled shared prompt into Cursor; **Paste reply** shows findings in the panel

CLI flags wired from the panel: Claude `--model` / `--effort`; Codex `--model` / `-c model_reasoning_effort=…`; Grok `--model` / `--effort`.

```bash
# preferred — local coding-agent CLI (same shell as `just editor`)
# export EDITOR_REVIEW_CLI=auto          # default: claude → codex → grok
# export EDITOR_REVIEW_CLI=claude        # force one
# export EDITOR_REVIEW_CLI_PATH=/usr/local/bin/claude
# export EDITOR_REVIEW_CLI=off           # skip CLI detection
# export EDITOR_REVIEW_MODEL=sonnet      # env default for panel / HTTP
# export EDITOR_REVIEW_EFFORT=medium

# fallback — HTTP API
export EDITOR_REVIEW_API_KEY=sk-...   # or OPENAI_API_KEY
# export EDITOR_REVIEW_API_BASE=https://api.openai.com/v1
```

Shared prompt (editor + `just review-post` + paste-into-Cursor): `tools/editor/prompts/writing-coach.md`.

CLI bridge from repo root:

```bash
just review-post _posts/YYYY-MM-DD-slug.md
# prefer local CLI, else API key:
just review-post _posts/... -- --run
```

## Tests

```bash
just editor-test
# or: cd tools/editor && npm test
```

Other recipes from the repo root: `just editor-install`, `just editor-build`, `just editor-clean`, `just review-post` (see root `justfile`).

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
- `GET /api/review/config` — detected CLI + whether an LLM key is configured (never returns the key)
- `POST /api/review` — `{ filename|path, title, body, run?, prefer? }` → filled coach `prompt`; if `run`, prefers local CLI then API key; returns `review` Markdown + parsed `sections`

## Jekyll

`tools/`, `node_modules`, and Node lock/manifest files are in `_config.yml` `exclude`.
