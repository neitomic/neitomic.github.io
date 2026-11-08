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
