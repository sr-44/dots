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
  - `scripts/` — wallpaper manager, screenshot, bar toggle, battery check, dynamic border
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
- **xkb/** — custom xkb rules, types + symbols (`custom:tj_switch` layout-switching option)
- **betta/** — interactive live wallpaper: a procedural halfmoon betta fish (no textures or models)
  - `betta.js` — WebGL2 renderer, spring-driven fin rays, swimming behaviour; `index.html` hosts it
  - `betta-wallpaper` — Python host (GTK4 + gtk4-layer-shell + WebKitGTK 6.0) that puts the page on the
    background layer of every output; works on niri and Hyprland. Running it again turns it off.
    Extra `key=value` args become page params: `size`, `fps` (host default 60), `dust`, `seed`
  - The fish follows the pointer over the bare desktop and eats food dropped with a left click
  - swaybg keeps running underneath, so turning the fish off reveals the static wallpaper
  - Pigment is baked into textures at startup; only the fish's screen rectangle is multisampled,
    which keeps the frame cost low. When windows cover the wallpaper, niri throttles it to ~1 fps
  - Test params: `still=<s>&pose=ref&png` (deterministic frame as a data URL in `#err`),
    `bench` (frame cost), `dbg[&manual]` (exposes `window.betta`; `manual` steps only via `betta.step(dt)`)
- **gtk/** — GTK 2/3/4 themes + xsettingsd
- **neofetch/** — fetch config
- **.zshrc** — zsh with oh-my-zsh, Catppuccin Mocha theme, plugins: git, zsh-syntax-highlighting, tmux, artisan
- **.vimrc** — vim config

## Keyboard Layouts

Three layouts are configured: `us, ru, tj`. Switching is defined entirely in xkb
(`xkb/symbols/custom` + `xkb/types/custom`, exposed as the option `custom:tj_switch` by
`xkb/rules/evdev`), so it behaves identically under niri and Hyprland:

- **Caps Lock** — toggles `us` <-> `ru` only; from `tj` it returns to `ru`
- **Ctrl+Caps Lock** — switches to `tj`; from `tj` it returns to `ru`
- **Shift+Caps Lock** — plain Caps Lock, as with `grp:caps_toggle`

Tajik is deliberately kept out of the Caps Lock cycle since it is used rarely.

The three levels come from the custom type `CAPS_TJ_SWITCH` (`modifiers = Shift+Control`):
xkeyboard-config ships no type combining Shift and Ctrl as level choosers — `PC_CONTROL_LEVEL2`
knows only Ctrl, `FOUR_LEVEL` only Shift and AltGr.

The option is applied via `options "custom:tj_switch"` (niri) and `kb_options` (Hyprland);
both read `~/.config/xkb`, so the symlink `ln -sf ~/dots/xkb ~/.config/xkb` is required.

libxkbcommon builds its include paths once, when the compositor creates its xkb context,
and silently skips directories that do not exist yet. So `~/.config/xkb` must exist
*before* the session starts: after creating the symlink, restart the compositor session —
a config reload is not enough. If the option is not picked up, the journal shows
`[XKB-595] Unrecognized RMLVO option "custom:tj_switch" was ignored` and Caps Lock falls
back to plain caps locking.

Each group is included separately with an explicit index
(`+custom(tj_switch_g1):1+custom(tj_switch_g2):2+...`) because libxkbcommon drops every
group but the first when a multi-group section is pulled in as an option (XKB-700).

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
