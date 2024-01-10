#!/bin/bash

COUNT=$(~/projects/personal/helper-cli/cli todo count)
TASKS="ᅠ"
COMPLETED="ᅠ"

if [ $COUNT != 0 ]; then echo " $COUNT"; else echo $COMPLETED; fi
