#!/usr/bin/env bash

# Получение списка приложений, сортировка по номеру рабочего стола
apps=$(hyprctl clients -j | jq -r 'sort_by(.workspace.name | tonumber) | .[] | "\(.title) (Workspace: \(.workspace.name))"')

# Показ списка в rofi и выбор приложения
chosen=$(echo "$apps" | rofi -dmenu -i -p "Select application:" -theme ~/.config/rofi/switcher/style.rasi)

# Получение номера рабочего стола из выбранного элемента
workspace=$(echo "$chosen" | awk '{print $NF}')

# Переключение на выбранный рабочий стол
hyprctl dispatch workspace $workspace

