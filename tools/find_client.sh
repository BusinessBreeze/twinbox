#!/usr/bin/env bash

# If an interface is passed as argument, use it; otherwise auto-detect the first active ethernet interface (en*, eth*)
IFACE="${1:-}"

if [ -z "$IFACE" ]; then
    IFACE=$(ip -br link show | awk '$1 ~ /^(eth|en)/ && $2 ~ /(UP|UNKNOWN)/ {print $1; exit}')
fi

if [ -z "$IFACE" ]; then
    # Fallback to any physical ethernet interface if none is UP
    IFACE=$(ip -br link show | awk '$1 ~ /^(eth|en)/ {print $1; exit}')
fi

if [ -z "$IFACE" ]; then
    echo "Error: No ethernet interface found."
    echo "Available interfaces:"
    ip -br address
    exit 1
fi

echo "========================================"
echo " Ethernet Interface: $IFACE"
echo "========================================"

echo ""
echo "--- Ubuntu Local IP (ip -br address) ---"
ip -br address show dev "$IFACE"

echo ""
echo "--- Connected Host/Client IP (ip neighbor) ---"
NEIGHBORS=$(ip neighbor show dev "$IFACE" | grep -v "FAILED")

if [ -n "$NEIGHBORS" ]; then
    echo "$NEIGHBORS"
else
    echo "No neighbor/client entries currently found on $IFACE."
    echo "Hint: Try pinging the subnet or the client host first if the ARP cache is empty."
fi
echo "========================================"
