#!/bin/bash

COUNT=$(swaync-client -c -sw 2>/dev/null)
ENABLED=""
DISABLED=""
if swaync-client -D -sw 2>/dev/null | grep -q "true"; then ICON=$DISABLED; else ICON=$ENABLED; fi
if [ "$COUNT" != "0" ] && [ -n "$COUNT" ]; then echo "$ICON $COUNT"; else echo "$ICON"; fi
