---
layout: post
title:  "I finally feel excited about my dotfiles"
date:   2026-06-28 13:26:00 +0700
tags: [general]
---

My dotfiles is here [neitomic/dotfiles](https://github.com/neitomic/dotfiles)

## Windows manager

I've started using yabai + skhd for like a year now.
And I feel good about it.
The only thing I'm still not very comfortable is how to quickly open
my Slack and Obsidian. Like I have to remember where it is, then
navigate, then navigate back. It make me feel like forever.

Normally when I plug my Macbook into big monitor, I just put my
Slack always on the Macbook screen, and do my work only on the big one.

The uncomfortable come when I don't have the big monitor with me.
Like, I have one workspace for Web browser, one for IDE, one for terminal.
The 4th one for SQL workbench. Then the 5th for my personal profile Web browser.

Five workspaces already feel too much for me. I'm not good at managing them tbh.

So when I want to quickly view Slack messages or do a quick reply,
the context switching cost is high, which made me uncomfortable.

So I was thinking, what if I can just allow Slack to be float window,
then have a key combination to bring it into front + focus, do the message,
then hind it away.

And I did that, and applied to Obsidian as well

- Put Slack as unmanaged in yabai.
- Put a keyboard shortcut in skhd to bring Slack on top, move it into current workspace.
- Put the same shortcut to hide it.

`skhd/toggle-app.sh`

```bash
#!/usr/bin/env bash
app_name=$1
focused=$(yabai -m query --windows --window 2>/dev/null | jq -r '.app // empty')

if [ "$focused" = "$app_name" ]; then
  osascript -e "tell application \"System Events\" to set visible of process \"$app_name\" to false"
else
  if ! pgrep -xq $app_name; then
    open -a $app_name
    sleep 0.4
  else
    osascript -e "tell application \"System Events\" to set visible of process \"$app_name\" to true"
  fi

  win=$(yabai -m query --windows | jq -r "map(select(.app==\"$app_name\")) | .[0].id // empty")
  if [ -n "$win" ]; then
    space=$(yabai -m query --spaces --space | jq '.index')
    yabai -m window "$win" --space "$space"   # move to current space
    yabai -m window --focus "$win"            # then focus it
  fi
fi
```

`skhd/skhdrc`

```bash
cmd + shift - s : ~/.config/skhd/toggle-app.sh "Slack"
cmd + shift - n : ~/.config/skhd/toggle-app.sh "Obsidian"
```

`yabai/yabairc`

```bash
yabai -m rule --add app="^Slack$" manage=off
yabai -m rule --add app="^Obsidian$" manage=off
```

## tmux

My tmux config is not something very special.

- map prefix to C-a
- enable mouse
- `-` and `_` for split window
- Enter for copy mode
- vim navigator
- resurrect and continuum
- sesh for sessions management
- dracula theme

## neovim with lazyvim

Nothing special here. Mostly default.
