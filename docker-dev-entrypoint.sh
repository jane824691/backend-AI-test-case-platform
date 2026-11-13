#!/bin/sh
set -eu

lock_checksum="$(sha256sum package-lock.json | awk '{print $1}')"
stamp_file="node_modules/.package-lock.sha256"

if [ ! -f "$stamp_file" ] || [ "$(cat "$stamp_file")" != "$lock_checksum" ]; then
  echo "Installing backend dependencies for the current package-lock.json..."
  npm ci
  printf '%s' "$lock_checksum" > "$stamp_file"
fi

exec "$@"
