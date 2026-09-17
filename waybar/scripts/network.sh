#!/usr/bin/env bash
# Waybar network module: works for both wired and wireless.
# Picks the active physical interface by carrier (handles USB-ethernet /
# tethering whose operstate is "unknown"), skips VPN/virtual links, and
# computes throughput directly from /sys. Click toggles icon <-> speed.

STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}/waybar-net"
mkdir -p "$STATE_DIR" 2>/dev/null
MODE_FILE="$STATE_DIR/mode"
PREV_FILE="$STATE_DIR/prev"

ICON_WIFI=$''   # nf-fa-wifi (U+F1EB)
ICON_ETH=$''    # nf-fa-globe (U+F0AC)
ICON_OFF=$''    # nf-fa-plane / no connection (U+F072)

# --- click handler: flip display mode -----------------------------------
if [ "${1:-}" = "toggle" ]; then
    if [ "$(cat "$MODE_FILE" 2>/dev/null)" = "speed" ]; then
        printf 'icon' > "$MODE_FILE"
    else
        printf 'speed' > "$MODE_FILE"
    fi
    exit 0
fi

mode=$(cat "$MODE_FILE" 2>/dev/null || printf 'icon')

is_virtual() {
    case "$1" in
        lo|vpn*|tun*|tap*|wg*|docker*|veth*|br-*|virbr*|bond*) return 0 ;;
        *) return 1 ;;
    esac
}

# interface holding the default route (may be a VPN tunnel)
defdev=$(ip route show default 2>/dev/null \
    | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')

# pick the physical interface with carrier; prefer the default-route one
iface=""
fallback=""
for path in /sys/class/net/*; do
    n=${path##*/}
    is_virtual "$n" && continue
    [ "$(cat "$path/carrier" 2>/dev/null)" = "1" ] || continue
    [ -z "$fallback" ] && fallback="$n"
    if [ "$n" = "$defdev" ]; then
        iface="$n"
        break
    fi
done
[ -z "$iface" ] && iface="$fallback"

if [ -z "$iface" ]; then
    printf '{"text":"%s","tooltip":"Нет подключения","class":"disconnected"}\n' "$ICON_OFF"
    rm -f "$PREV_FILE"
    exit 0
fi

# wifi vs ethernet
if [ -e "/sys/class/net/$iface/phy80211" ] || [ -d "/sys/class/net/$iface/wireless" ]; then
    icon="$ICON_WIFI"; typ="Wi-Fi"
else
    icon="$ICON_ETH"; typ="Ethernet"
fi

ip4=$(ip -o -4 addr show "$iface" 2>/dev/null | awk '{print $4; exit}')

# --- throughput from byte counters --------------------------------------
now=$(date +%s%N)
rx=$(cat "/sys/class/net/$iface/statistics/rx_bytes" 2>/dev/null || printf 0)
tx=$(cat "/sys/class/net/$iface/statistics/tx_bytes" 2>/dev/null || printf 0)

down=0; up=0
if [ -r "$PREV_FILE" ]; then
    read -r p_if p_rx p_tx p_ns < "$PREV_FILE"
    if [ "$p_if" = "$iface" ] && [ -n "$p_ns" ] && [ "$now" -gt "$p_ns" ]; then
        dt=$(( now - p_ns ))
        down=$(( (rx - p_rx) * 8000000000 / dt ))
        up=$(( (tx - p_tx) * 8000000000 / dt ))
        [ "$down" -lt 0 ] && down=0
        [ "$up" -lt 0 ] && up=0
    fi
fi
printf '%s %s %s %s\n' "$iface" "$rx" "$tx" "$now" > "$PREV_FILE"

human() {
    awk -v b="$1" 'BEGIN{
        if      (b>=1000000000) printf "%.1fGb/s", b/1000000000;
        else if (b>=1000000)    printf "%.1fMb/s", b/1000000;
        else if (b>=1000)       printf "%.1fkb/s", b/1000;
        else                    printf "%db/s", b;
    }'
}
dstr=$(human "$down"); ustr=$(human "$up")

tooltip="$typ ($iface)\\n${ip4:-нет IP}\\n↓ $dstr   ↑ $ustr"
if [ "$mode" = "speed" ]; then
    text="↓ $dstr  ↑ $ustr"
else
    text="$icon"
fi
printf '{"text":"%s","tooltip":"%s","class":"%s"}\n' "$text" "$tooltip" "$typ"
