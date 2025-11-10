#!/usr/bin/env bash

WPDIR="$HOME/others/wallpapers"
STATE="$HOME/.cache/current_wp"

mapfile -t files < <(find -L "$WPDIR" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' \) | sort)
[ "${#files[@]}" -eq 0 ] && exit 1

entries=""
for f in "${files[@]}"; do
    name=$(basename "$f")
    entries+="$name\x00icon\x1f$f\n"
done

chosen=$(echo -e "$entries" | rofi -dmenu -p "Wallpaper" -theme ~/.config/rofi/wallpapers/style.rasi)

[ -z "$chosen" ] && exit 0

for i in "${!files[@]}"; do
    if [[ "$(basename "${files[$i]}")" == "$chosen" ]]; then
        wp="${files[$i]}"
        echo $((i+1)) > "$STATE"
        break
    fi
done

if [ -n "$wp" ] && [ -f "$wp" ]; then
    pkill swaybg 2>/dev/null
    swaybg -i "$wp" >/dev/null 2>&1 &
fi

