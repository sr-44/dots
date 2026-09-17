# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal dotfiles repository for Arch Linux with Hyprland (Wayland). Configs are stored here and symlinked to `~/.config/<tool>/` or directly to `~/`.

## Applying Configs

There is no install script — configs are manually symlinked. The general pattern:

```sh
ln -sf ~/dots/<tool>/ ~/.config/<tool>
# or for root-level files:
ln -sf ~/dots/.zshrc ~/.zshrc
ln -sf ~/dots/.vimrc ~/.vimrc
```

Hyprland configs live in `~/.config/hypr/` and reference scripts via `~/.config/hypr/scripts/`.

## Architecture

### Active Setup (Hyprland / Wayland)
- **hypr/** — Hyprland WM config split across:
  - `hyprland.conf` — main config (monitor layout, env vars, startup, visuals); sources `keybinds.conf`
  - `keybinds.conf` — all keybindings, `$mod = SUPER`
  - `hypridle.conf` / `hyprlock.conf` — idle/lock screen
  - `scripts/` — wallpaper manager, screenshot, bar toggle, battery check, dynamic border, Tajik layout helper
- **waybar/** — status bar; `config` defines modules layout, `style.css` styles it; `scripts/` has dunst toggle and todo helper; `icons/` has custom SVG icons with a meson build for GResource
- **rofi/** — app launcher and menus; `onedark.rasi` is the base theme; `launcher/`, `powermenu/` are separate entry points with their own scripts
- **dunst/** — notification daemon config (`dunstrc`)
- **alacritty/** — terminal; split into `alacritty.toml`, `colors.toml`, `fonts.toml`
- **tmux/** — based on gpakosz/.tmux; `tmux.conf` is upstream (do not edit directly), `tmux.conf.local` holds customizations
- **swaylock/** — lock screen config

### Alternative Setup (niri / Wayland)
- **niri/** — niri scrollable-tiling compositor config:
  - `config.kdl` — single KDL config file (layout, keybinds, window rules, animations, startup)
  - `waybar-config` — waybar config adapted for niri (uses `niri/workspaces` and `niri/language` modules)
  - Reuses: `hypr/scripts/` (wallpaper, screenshot, bar, battery-check), `rofi/`, `dunst/`, `alacritty/`
  - Symlink: `ln -sf ~/dots/niri/ ~/.config/niri`
  - For waybar with niri: `ln -sf ~/dots/niri/waybar-config ~/.config/waybar/config`

### Legacy Setup (bspwm / X11)
- **bspwm/** — bspwmrc startup config
- **sxhkd/** — keybindings for bspwm
- **polybar/** — bar config split into `config.ini`, `colors.ini`, `modules/`
- **picom/** — compositor config

### Shared / Global
- **gtk/** — GTK 2/3/4 themes + xsettingsd
- **neofetch/** — fetch config
- **.zshrc** — zsh with oh-my-zsh, Catppuccin Mocha theme, plugins: git, zsh-syntax-highlighting, tmux, artisan
- **.vimrc** — vim config

## Color Scheme

All configs use **Catppuccin Mocha**. Key colors referenced across configs:
- `#1e1e2e` base, `#89b4fa` blue, `#b4befe` lavender, `#cdd6f4` text

## Font

**JetBrains Mono** is used across terminal, bar, and launcher configs.

## Key Relationships

- `hyprland.conf` sources `keybinds.conf` via `source=~/.config/hypr/keybinds.conf`
- Wallpaper script is called as `$wp = bash ~/.config/hypr/scripts/wallpaper` and used in keybinds
- Waybar icons use a meson/GResource build (`waybar/icons/meson.build`) — rebuild after adding SVG icons:
  ```sh
  meson setup build waybar/icons/
  ninja -C build
  ```
- `tmux.conf.local` overrides values from `tmux.conf`; only edit the `.local` file
