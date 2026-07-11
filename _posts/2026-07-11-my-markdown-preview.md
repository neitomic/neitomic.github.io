---
layout: post
title:  "My markdown preview server"
date:   2026-07-11 21:47:00 +0700
tags: [general]
---

I'm working a lot with LLM agents lately and keeping a lot of markdown documents
in the repository. Those are agent instructions, notes, ADRs, documents,...

I'd like to have rich formatting like diagrams, tables, code snippets,...
in my documents, and the markdown viewer in IDEs not supporting all the things
I want, and there is something that make me not comfortable reading in there.

The markdown preview in side neovim is good, but not supporting mermaid diagrams.

So I made one for myself. It is here [neitomic/mdprev](https://github.com/neitomic/mdprev)

**Some highlight features:**

- Explorer navigation — browse directories, open files, follow relative links between docs. Breadcrumbs on every page.
- Quick file finder — press ⌘K (or Ctrl+K) to fuzzy-search Markdown filenames, then press Enter to open one.
- Live reload — edits appear instantly; scroll position is preserved (only the article body is swapped).
- GitHub-flavored markdown — tables, task lists, footnotes, strikethrough, and GitHub-style alerts (> [!NOTE]).
- Light and dark themes — follows your system by default; use the theme button in the header to choose and remember a preference. Syntax highlighting and Mermaid diagrams follow it too.
- Mermaid diagrams — ```mermaid blocks, rendered client-side with a full-page zoom-and-pan viewer. The bundle is embedded and lazy-loaded (only on pages that use it).
- ASCII diagrams — ```bob, ```svgbob, or ```ascii blocks are rendered to SVG server-side.

**Adding into my lazyvim config**

`lua/config/keymaps.lua`
```lua
local mdprev_job = nil
local function toggle_markserv()
  if mdprev_job then
    vim.fn.jobstop(mdprev_job)
    mdprev_job = nil
    vim.notify("mdprev stopped")
    return
  end
  mdprev_job = vim.fn.jobstart({ "mdprev", "-o", "-q",  vim.fn.getcwd() })
  vim.notify("mdprev serving " .. vim.fn.getcwd())
end
vim.api.nvim_create_user_command("MarkdownFolder", toggle_markserv, {})
vim.keymap.set("n", "<leader>mm", toggle_markserv, { desc = "Toggle mdprev (folder markdown preview)" })
```
