#!/bin/bash
set -euo pipefail

# BDS 1.26.x ignores range/comma server-udp-ports mappings (BDS-23126), so it
# advertises only the container's private bridge address. NetherNet needs one
# UDP port per player, and clients must receive the public address. Generate
# one single-port mapping per line, then hand over to the image's entrypoint.

props=/data/server.properties
mkdir -p /data
touch "$props"

public_ip="${BEDROCK_PUBLIC_IP:-}"
if [[ -z "$public_ip" ]]; then
  public_ip="$(curl -4 -fsS --max-time 10 https://ifconfig.me || true)"
fi
if [[ -z "$public_ip" ]]; then
  echo "ERROR: cannot determine the public IPv4 for NetherNet." >&2
  echo "Set BEDROCK_PUBLIC_IP in .env or fix outbound access to ifconfig.me." >&2
  exit 1
fi
if [[ ! "$public_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "ERROR: BEDROCK_PUBLIC_IP must be an IPv4 literal, got '${public_ip}'." >&2
  exit 1
fi

start="${BEDROCK_UDP_PORT_START:-19140}"
end="${BEDROCK_UDP_PORT_END:-19155}"

echo "==> NetherNet UDP mappings: ${public_ip}:${start}-${end}"

tmp="$(mktemp)"
grep -vE '^[[:space:]]*server-udp-ports[[:space:]]*=' "$props" > "$tmp" || true
for ((port = start; port <= end; port++)); do
  printf 'server-udp-ports=%s:%s:%s\n' "$public_ip" "$port" "$port" >> "$tmp"
done
cat "$tmp" > "$props"
rm -f "$tmp"

# BDS runs as uid 1000 and may rewrite server.properties on startup.
chown 1000:1000 "$props" 2>/dev/null || true

exec /opt/demoter-entry.sh
