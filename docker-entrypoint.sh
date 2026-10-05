#!/bin/sh
set -eu

mkdir -p /app/data
chown -R nextjs:nodejs /app/data

# A separate persistent volume keeps sign-in and refreshed credentials across rebuilds.
mkdir -p /app/codex-home
chown -R nextjs:nodejs /app/codex-home
chmod 700 /app/codex-home

exec su-exec nextjs:nodejs "$@"
