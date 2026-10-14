#!/usr/bin/env bash
# Run on the Linux Docker host from any working directory.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage: bash scripts/redeploy.sh [--check]

Redeploy the current checkout using docker-compose.yml. Requires an existing
running deployment, Bash, Docker Compose v2, flock, realpath, and tar.
--check validates prerequisites and Compose configuration without deploying.

Optional environment variables:
  BACKUP_ROOT     Backup directory outside the checkout. Default: sibling
                  grocery-splitter-backups directory.
  HEALTH_TIMEOUT Seconds to wait for HTTP checks. Default: 120.

Run with sudo if required for Docker access or reading the persistent folders.
EOF
}

check_only=0
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --check) check_only=1 ;;
  '') ;;
  *) usage >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { usage >&2; exit 2; }

log() { printf '[redeploy] %s\n' "$*"; }
die() { log "$*" >&2; exit 1; }
for command in docker flock realpath tar mktemp date cksum; do
  command -v "$command" >/dev/null || die "Required command missing: $command"
done

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
service=grocery-splitter
health_timeout=${HEALTH_TIMEOUT:-120}
[[ $health_timeout =~ ^[1-9][0-9]{0,3}$ ]] || die 'HEALTH_TIMEOUT must be an integer from 1 to 9999.'
docker compose version >/dev/null
docker info >/dev/null

# Keep the lock outside the Docker build context. All runs by this user for this
# checkout use the same lock; schedule deployments under a single OS account.
lock_key=$(printf '%s' "$repo" | cksum)
lock_key=${lock_key%% *}
exec 9>"${TMPDIR:-/tmp}/grocery-splitter-redeploy-${UID}-${lock_key}.lock"
flock -n 9 || die 'Another deployment is already running for this checkout.'

old_container=$(docker inspect --format '{{.Id}}' "$service")
[[ $(docker inspect --format '{{.State.Running}}' "$old_container") == true ]] || die 'The existing container must be running. Use Docker Compose for first-time setup.'
project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$old_container")
[[ -n $project && $project != '<no value>' ]] || die 'Existing container is not managed by Docker Compose.'
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$old_container") == "$service" ]] || die 'Existing container has an unexpected Compose service.'

# Refuse to back up an unrelated checkout or named volumes as if they were the
# bind mounts documented by this repository.
for folder in data codex-home; do
  source_path=$(docker inspect --format "{{range .Mounts}}{{if eq .Destination \"/app/$folder\"}}{{if eq .Type \"bind\"}}{{.Source}}{{end}}{{end}}{{end}}" "$old_container")
  [[ -n $source_path && $(realpath -- "$source_path") == "$repo/$folder" ]] || die "Existing /app/$folder mount does not point to $repo/$folder."
done

base_compose=(docker compose --project-directory "$repo" -p "$project" -f "$repo/docker-compose.yml")
"${base_compose[@]}" config --quiet
old_image=$(docker inspect --format '{{.Image}}' "$old_container")
docker image inspect "$old_image" >/dev/null
backup_root=$(realpath -m -- "${BACKUP_ROOT:-$repo/../grocery-splitter-backups}")
case "$backup_root/" in
  "$repo/"*) die 'BACKUP_ROOT must be outside the checkout to keep secrets out of image builds.' ;;
esac
if (( check_only )); then
  log "Preflight passed for Compose project $project. No deployment performed."
  exit 0
fi

mkdir -p -- "$backup_root"
backup=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
run_id=${backup##*/}
candidate_image="grocery-splitter-redeploy:candidate-${run_id,,}"
rollback_image="grocery-splitter-redeploy:previous-${run_id,,}"
config="$backup/compose.yaml"
override="$backup/image.yaml"
recovery_needed=0
replacement_started=0

compose() { docker compose --project-directory "$repo" -p "$project" -f "$config" -f "$override" "$@"; }
select_image() {
  printf 'services:\n  %s:\n    image: %s\n    pull_policy: never\n' "$service" "$1" > "$override"
}
healthy() {
  local deadline=$((SECONDS + health_timeout))
  while (( SECONDS < deadline )); do
    if compose exec -T "$service" node -e '
      (async () => {
        for (const path of ["/", "/api/household", "/api/trips?view=history"]) {
          const res = await fetch("http://127.0.0.1:3000" + path, {
            signal: AbortSignal.timeout(3000), redirect: "error"
          });
          if (!res.ok) throw new Error(path + ": HTTP " + res.status);
          if (path !== "/") {
            const body = await res.json();
            if (path === "/api/household" ? !Array.isArray(body.participants) : !Array.isArray(body)) {
              throw new Error(path + ": unexpected response");
            }
          } else {
            await res.arrayBuffer();
          }
        }
      })().catch(() => process.exit(1));
    ' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}
finish() {
  local status=$?
  trap - EXIT INT TERM
  if (( recovery_needed )); then
    log 'Deployment failed or was interrupted. Recovering the previous app image.' >&2
    if (( replacement_started )); then
      select_image "$rollback_image"
      if compose up -d --no-build --no-deps --force-recreate "$service" && healthy; then
        log 'Previous image is running and passed HTTP checks.' >&2
      else
        log "ROLLBACK FAILED. Inspect Docker manually. Backup: $backup" >&2
      fi
    elif docker start "$old_container" >/dev/null; then
      log 'Original container restarted.' >&2
    else
      log "RESTART FAILED. Inspect Docker manually. Backup: $backup" >&2
    fi
    # Even a successful rollback must report a failed deployment to automation.
    status=1
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Freeze the resolved configuration with absolute mounts and private permissions.
# It may contain environment secrets, so never print it to automation logs.
"${base_compose[@]}" config > "$config"
docker tag "$old_image" "$rollback_image"
printf '%s\n' "$old_image" > "$backup/previous-image.txt"
select_image "$candidate_image"
log 'Building the candidate image while the existing app stays online.'
compose build "$service"

log 'Stopping the app for a consistent database and credential backup.'
recovery_needed=1
docker stop --time 30 "$old_container" >/dev/null
tar -C "$repo" -czf "$backup/persistent-state.tar.gz" -- data codex-home
tar -tzf "$backup/persistent-state.tar.gz" >/dev/null
log "Backup saved in $backup"

log 'Starting the candidate image.'
replacement_started=1
compose up -d --no-build --no-deps --force-recreate "$service"
healthy || die "Candidate failed HTTP checks within $health_timeout seconds."
recovery_needed=0
log "Deployment passed HTTP checks. Backup and previous image retained: $backup"
