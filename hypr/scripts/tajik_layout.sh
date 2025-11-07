#!/bin/bash

current_layout=$(hyprctl devices -j | jq -r '.keyboards[].active_keymap' | tail -n 1)

if [[ "$current_layout" == "Russian" ]]; then
    hyprctl keyword input:kb_layout tj
    hyprctl reload
elif [[ "$current_layout" == "Tajik" ]]; then
    hyprctl keyword input:kb_layout ru
    hyprctl reload
else
    hyprctl keyword input:kb_layout ru
    hyprctl reload
fi

