#!/usr/bin/env bash
# Exercise deployment ordering and recovery without touching a Docker daemon.
set -Eeuo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/app/scripts" "$fixture/app/data" "$fixture/app/codex-home"
cp "$repo/scripts/redeploy.sh" "$fixture/app/scripts/redeploy.sh"
printf 'services: {}\n' > "$fixture/app/docker-compose.yml"
printf '{"household": {}}\n' > "$fixture/app/data/database.json"
printf 'test credential\n' > "$fixture/app/codex-home/auth.json"
export MOCK_REPO="$fixture/app" MOCK_STATE="$fixture/state"
export BACKUP_ROOT="$fixture/backups" HEALTH_TIMEOUT=1
export PATH="$fixture/bin:$PATH"
cat > "$fixture/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$MOCK_STATE/commands"
case "$1" in
  info|tag) exit 0 ;;
  image) exit 0 ;;
  inspect)
    case "$3" in
      '{{.Id}}') echo old-container ;;
      '{{.State.Running}}') echo true ;;
      '{{.Image}}') echo sha256:old-image ;;
      *com.docker.compose.project*) echo grocery-test ;;
      *com.docker.compose.service*) echo grocery-splitter ;;
      *codex-home*) echo "$MOCK_REPO/codex-home" ;;
      *'/app/data'*) echo "$MOCK_REPO/data" ;;
      *) exit 2 ;;
    esac
    ;;
  stop) touch "$MOCK_STATE/stopped"; [[ $MOCK_FAILURE != stop ]] ;;
  start) touch "$MOCK_STATE/restarted" ;;
  compose)
    case " $* " in
      *' version '*) exit 0 ;;
      *' config '*) echo 'services: {}'; exit 0 ;;
      *' build '*) [[ ! -f $MOCK_STATE/stopped && $MOCK_FAILURE != build ]] ;;
      *' up '*)
        while [[ $1 != -f ]]; do shift; done
        config=$2
        shift 2
        [[ $1 == -f ]]
        if [[ $(cat "$2") == *previous-* ]]; then
          touch "$MOCK_STATE/rollback"
          [[ $MOCK_FAILURE != rollback ]]
        else
          touch "$MOCK_STATE/replaced"
          [[ $MOCK_FAILURE != replace ]]
        fi
        ;;
      *' exec '*)
        [[ -f $MOCK_STATE/rollback ]] && exit 0
        [[ $MOCK_FAILURE != health && $MOCK_FAILURE != rollback ]]
        ;;
      *) exit 2 ;;
    esac
    ;;
  *) exit 2 ;;
esac
EOF
real_tar=$(command -v tar)
export REAL_TAR="$real_tar"
cat > "$fixture/bin/tar" <<'EOF'
#!/usr/bin/env bash
[[ $MOCK_FAILURE != backup ]] || exit 1
[[ -f $MOCK_STATE/stopped && ! -f $MOCK_STATE/replaced ]] || exit 1
exec "$REAL_TAR" "$@"
EOF
chmod +x "$fixture/bin/docker" "$fixture/bin/tar"

run_case() {
  local failure=$1 expected=$2
  shift 2
  rm -rf -- "$MOCK_STATE"
  mkdir -p "$MOCK_STATE"
  export MOCK_FAILURE="$failure"
  local status=0
  bash "$fixture/app/scripts/redeploy.sh" "$@" > "$fixture/output" 2>&1 || status=$?
  if [[ $status != "$expected" ]]; then
    cat "$fixture/output" >&2
    echo "FAIL: $failure returned $status, expected $expected" >&2
    exit 1
  fi
}
assert_file() { [[ -f $MOCK_STATE/$1 ]] || { echo "Missing event: $1" >&2; exit 1; }; }
assert_absent() { [[ ! -f $MOCK_STATE/$1 ]] || { echo "Unexpected event: $1" >&2; exit 1; }; }

run_case none 0 --check
assert_absent stopped
[[ ! -d $BACKUP_ROOT ]]
run_case build 1
assert_absent stopped
assert_absent replaced
run_case stop 1
assert_file restarted
assert_absent replaced
run_case backup 1
assert_file stopped
assert_file restarted
assert_absent replaced
run_case replace 1
assert_file replaced
assert_file rollback
run_case health 1
assert_file replaced
assert_file rollback
run_case rollback 1
assert_file rollback
[[ $(cat "$fixture/output") == *'ROLLBACK FAILED'* ]]
run_case none 0
assert_file stopped
assert_file replaced
assert_absent rollback
archive=$(find "$BACKUP_ROOT" -name persistent-state.tar.gz | head -n 1)
"$REAL_TAR" -tzf "$archive" | grep -q '^data/database.json$'
"$REAL_TAR" -tzf "$archive" | grep -q '^codex-home/auth.json$'
run_case none 2 --unknown
lock_key=$(printf '%s' "$MOCK_REPO" | cksum)
lock_key=${lock_key%% *}
exec 8>"${TMPDIR:-/tmp}/grocery-splitter-redeploy-${UID}-${lock_key}.lock"
flock -n 8
run_case none 1
assert_absent stopped
[[ $(cat "$fixture/output") == *'Another deployment is already running'* ]]
flock -u 8
echo 'Passed preflight, build/stop/backup/replacement failures, health rollback, failed rollback, successful deployment, argument checks, and deployment locking.'
