#!/usr/bin/env bash

dir="~/.config/rofi/helpers/"

# Options
bluetooth_on=''
bluetooth_off=''
connect_airpods=''
disconnect_airpods=''
notes_push=''
notes_pull=''
yes=''
no=''

# Rofi CMD
rofi_cmd() {
	rofi -dmenu \
		-p "Uptime: $uptime" \
		-mesg "Uptime: $uptime" \
		-theme ${dir}/style.rasi
}

# Confirmation CMD
confirm_cmd() {
	rofi -theme-str 'window {location: center; anchor: center; fullscreen: false; width: 350px;}' \
		-theme-str 'mainbox {children: [ "message", "listview" ];}' \
		-theme-str 'listview {columns: 2; lines: 1;}' \
		-theme-str 'element-text {horizontal-align: 0.5;}' \
		-theme-str 'textbox {horizontal-align: 0.5;}' \
		-dmenu \
		-p 'Confirmation' \
		-mesg 'Are you Sure?' \
		-theme ${dir}/style.rasi
}

# Ask for confirmation
confirm_exit() {
	echo -e "$yes\n$no" | confirm_cmd
}

# Pass variables to rofi dmenu
run_rofi() {
	echo -e "$bluetooth_on\n$bluetooth_off\n$connect_airpods\n$disconnect_airpods\n$notes_push\n$notes_pull" | rofi_cmd
}

# Execute Command
run_cmd() {
	selected="$(confirm_exit)"
	if [[ "$selected" == "$yes" ]]; then
		if [[ $1 == '--bluetooth-on' ]]; then
			systemctl start bluetooth
		elif [[ $1 == '--bluetooth-off' ]]; then
			systemctl stop bluetooth
		elif [[ $1 == '--notes-push' ]]; then
			helper notes:push
		elif [[ $1 == '--notes-pull' ]]; then
			helper notes:pull
		fi
	else
		exit 0
	fi
}

# Execute Command without confirmation
run_cmd_no_confirm() {
	if [[ $1 == '--connect-airpods' ]]; then
		bluetoothctl power on
		bluetoothctl connect 1C:D2:E5:4E:62:99
        pactl set-default-sink bluez_output.1C_D2_E5_4E_62_99.1
	elif [[ $1 == '--disconnect-airpods' ]]; then
		bluetoothctl disconnect 1C:D2:E5:4E:62:99
        pactl set-default-sink alsa_output.pci-0000_05_00.6.analog-stereo
    fi
}

# Actions
chosen="$(run_rofi)"
case ${chosen} in
    $bluetooth_on)
		run_cmd --bluetooth-on
        ;;
    $bluetooth_off)
		run_cmd --bluetooth-off
        ;;
    $connect_airpods)
		run_cmd_no_confirm --connect-airpods
        ;;
    $disconnect_airpods)
		run_cmd_no_confirm --disconnect-airpods
        ;;
    $notes_push)
        run_cmd --notes-push
        ;;
    $notes_pull)
        run_cmd --notes-pull
        ;;
esac

