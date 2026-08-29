#!/bin/sh
set -eu

delay_ms="${POSTGRES_START_DELAY_MS:-0}"

case "$delay_ms" in
  ''|*[!0-9]*)
    echo "POSTGRES_START_DELAY_MS must be a non-negative integer" >&2
    exit 64
    ;;
esac

if [ "$delay_ms" -gt 0 ]; then
  whole_seconds=$((delay_ms / 1000))
  remainder_ms=$((delay_ms % 1000))
  delay_seconds=$(printf '%d.%03d' "$whole_seconds" "$remainder_ms")
  printf '{"service":"postgres","event":"startup_delay_applied","detail":"%sms"}\n' "$delay_ms"
  sleep "$delay_seconds"
fi

original_entrypoint="${POSTGRES_ORIGINAL_ENTRYPOINT:-/usr/local/bin/docker-entrypoint.sh}"
exec "$original_entrypoint" "$@"
