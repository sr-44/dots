#!/usr/bin/env bash

config_file="$HOME/.config/rofi/switcher/app_icons.ini"

apps=$(hyprctl clients -j | jq -r '.[] | .class')

entries=""

for app in $apps; do
    icon_path=$(grep "^$app=" "$config_file" | cut -d'=' -f2)

    if [[ -z $icon_path ]]; then
        icon_path=$(geticons "$app" | head -n 1)
    fi

    if [[ -z $icon_path ]]; then
        app_lower=$(echo "$app" | tr '[:upper:]' '[:lower:]')
        icon_path=$(grep "^$app_lower=" "$config_file" | cut -d'=' -f2)
    fi

    if [[ -z $icon_path ]]; then
        icon_path=$(geticons "$app_lower" | head -n 1)
    fi


    if [[ -n $icon_path ]]; then
        entries+="$app\x00icon\x1f$icon_path\n"
    else
        entries+="$app\n"
    fi
done

chosen=$(echo -e "$entries" | rofi -dmenu -i -p "Select application" -theme ~/.config/rofi/switcher/style.rasi)

class_name=$(echo "$chosen" | sed 's/\\x00.*//')

workspace=$(hyprctl clients -j | jq -r ".[] | select(.class == \"$class_name\") | .workspace.id" | head -n 1)

if [[ -n $workspace ]]; then
    hyprctl dispatch workspace "$workspace"
else
    echo "Не удалось найти рабочий стол для класса $class_name."
fi

