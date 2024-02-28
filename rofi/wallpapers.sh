#!/bin/bash

wallpaper_dir="$HOME/others/wallpapers/"
wallpapers=($(find "$wallpaper_dir" -type f))
formatted_wallpapers=()

for ((i=0; i<${#wallpapers[@]}; i++)); do
    formatted_wallpapers+=("Wallpaper $((i+1))")
done

selected_wallpaper_index=$(printf "%s\n" "${formatted_wallpapers[@]}" | rofi -dmenu -i -p "Wallpapers" \
                        -theme "~/.config/rofi/wallpapers.rasi")


if [ -n "$selected_wallpaper_index" ]; then
    index=$(echo "$selected_wallpaper_index" | sed 's/Wallpaper //')
    if pgrep -x "swaybg" > /dev/null; then
        pkill swaybg
    fi
    swaybg -i "${wallpapers[index-1]}"
else
    echo "No wallpaper selected"
fi

