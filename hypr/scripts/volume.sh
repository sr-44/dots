#!/bin/bash

case $1 in
    up)
        # +5%
        pamixer -u -i 5
        ;;
    down)
        # -5%
        pamixer -u -d 5
        ;;
    mute)
        # Toggle mute
        pamixer -m
        ;;
esac
