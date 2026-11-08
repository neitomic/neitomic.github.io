# Local Jekyll blog editor under tools/editor — from repo root run: `just editor`

editor_dir := justfile_directory() / "tools" / "editor"

default:
    @just --list

[working-directory: 'tools/editor']
[doc('npm install in tools/editor')]
editor-install:
    npm install

# Install deps if node_modules is missing, then start API + Vite (127.0.0.1).
[doc('Start the local editor (install if needed)')]
editor:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{ editor_dir }}"
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    npm run dev

alias editor-dev := editor

[doc('Run editor unit tests')]
editor-test:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{ editor_dir }}"
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    npm test

[doc('Production build of the editor UI')]
editor-build:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{ editor_dir }}"
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    npm run build

[working-directory: 'tools/editor']
[doc('Remove editor node_modules and dist')]
editor-clean:
    rm -rf node_modules dist

# Fill the shared writing-coach prompt for a post (stdout).
# Example: just review-post _posts/2026-11-08-my-personal-gist-inbox.md
# Optional run: just review-post _posts/... -- --run
# Prefers local claude/codex/grok CLI, else EDITOR_REVIEW_API_KEY / OPENAI_API_KEY.
[doc('Print filled writing-coach prompt for a post path (optional -- --run)')]
review-post path *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{editor_dir}}"
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    # Resolve paths relative to the repo root even though we cd into tools/editor.
    post_path="{{path}}"
    if [[ "{{path}}" != /* ]]; then
      post_path="{{justfile_directory()}}/{{path}}"
    fi
    npx tsx scripts/review-post.ts "$post_path" {{args}}
