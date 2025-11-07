#!/usr/bin/env python3
import subprocess
from evdev import InputDevice, categorize, ecodes

# Укажи своё устройство мыши
dev = InputDevice("/dev/input/mouse2")  # замените на вашу мышь, узнаешь через `ls /dev/input/`

start_x = None

for event in dev.read_loop():
    if event.type == ecodes.EV_KEY and event.code == ecodes.BTN_MIDDLE:
        if event.value == 1:  # нажата
            start_x = None
        elif event.value == 0:  # отпущена
            start_x = None

    if event.type == ecodes.EV_REL and event.code == ecodes.REL_X and start_x is not None:
        delta = event.value
        if delta > 50:
            subprocess.run(["hyprctl", "dispatch", "workspace", "next"])
            start_x = None
        elif delta < -50:
            subprocess.run(["hyprctl", "dispatch", "workspace", "prev"])
            start_x = None

    if event.type == ecodes.EV_REL and event.code == ecodes.REL_X and start_x is None:
        start_x = 0

