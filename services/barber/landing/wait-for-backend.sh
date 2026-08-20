#!/bin/sh
# wait-for-backend.sh — wait until the backend TCP port is accepting connections
host="${1:-backend}"
port="${2:-3001}"
timeout="${3:-30}"

if command -v nc >/dev/null 2>&1; then
  for i in $(seq 1 "$timeout"); do
    if nc -z "$host" "$port"; then
      exit 0
    fi
    sleep 1
  done
else
  echo "nc not available; skipping backend readiness wait" >&2
  exit 0
fi

echo "Backend at $host:$port did not become ready within ${timeout}s" >&2
exit 1
