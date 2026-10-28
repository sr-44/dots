HUB=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
RUN=${XDG_RUNTIME_DIR:-/tmp}/hub
mkdir -p "$RUN"

note() { notify-send -a hub "$@"; }

need() {
    local c
    for c; do
        command -v "${c%%:*}" >/dev/null && continue
        note -u critical "hub: ${c%%:*} not found" "sudo pacman -S ${c#*:}"
        exit 1
    done
}
