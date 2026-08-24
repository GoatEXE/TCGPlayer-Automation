#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly VALID_REVISION="0123456789abcdef0123456789abcdef01234567"

test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local expected="$1"
  local file="$2"

  grep -F -- "$expected" "$file" >/dev/null || fail "missing $expected in $file"
}

expect_failure_output() {
  local output_file="$1"
  shift

  if "$@" >"$output_file" 2>&1; then
    fail "expected command to fail: $*"
  fi
}

# Invoke the real release entrypoint in a child Bash. BASH_ENV supplies bounded
# effect stubs so the test can prove release_deploy was entered without root or
# Docker. Before the fix, the valid command failed in arithmetic evaluation
# with `deploy: unbound variable` and never entered release_deploy.
entrypoint_marker="$test_root/release-deploy-reached"
entrypoint_env="$test_root/release-entrypoint-env.sh"
cat >"$entrypoint_env" <<'EOF'
local_image_for_revision() { :; }
require_root() { :; }
require_command() { :; }
load_host_config() { :; }
log() { printf '[test] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
validate_revision() { [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; }
assert_checkout_at_revision() {
  printf '%s\n' "${1:-}" >"$ENTRYPOINT_MARKER"
  return 1
}
EOF

run_release_entrypoint() {
  env \
    BASH_ENV="$entrypoint_env" \
    ENTRYPOINT_MARKER="$entrypoint_marker" \
    TCGPLAYER_RELEASE_DISPATCHED=1 \
    bash "$REPO_ROOT/ops/host/release.sh" "$@"
}

entrypoint_output="$test_root/release-entrypoint.out"
expect_failure_output "$entrypoint_output" run_release_entrypoint deploy "$VALID_REVISION"
[[ "$(cat "$entrypoint_marker")" == "$VALID_REVISION" ]] ||
  fail 'valid release CLI did not reach release_deploy checkout validation'
assert_contains 'managed checkout is not the requested release revision' "$entrypoint_output"
if grep -F 'unbound variable' "$entrypoint_output" >/dev/null; then
  fail 'valid release CLI still triggers nounset during argument validation'
fi

for invalid_case in no-args missing-revision wrong-command extra-argument empty-revision; do
  rm -f "$entrypoint_marker"
  case "$invalid_case" in
    no-args)
      invalid_args=()
      ;;
    missing-revision)
      invalid_args=(deploy)
      ;;
    wrong-command)
      invalid_args=(rollback "$VALID_REVISION")
      ;;
    extra-argument)
      invalid_args=(deploy "$VALID_REVISION" unexpected)
      ;;
    empty-revision)
      invalid_args=(deploy '')
      ;;
  esac
  expect_failure_output "$entrypoint_output" run_release_entrypoint "${invalid_args[@]}"
  assert_contains 'usage: release deploy REVISION' "$entrypoint_output"
  [[ ! -e "$entrypoint_marker" ]] || fail "$invalid_case invocation reached release_deploy"
  if grep -F 'unbound variable' "$entrypoint_output" >/dev/null; then
    fail "$invalid_case invocation triggered nounset instead of clear usage"
  fi
done

for invalid_revision in short-sha ABCDEF0123456789abcdef0123456789abcdef; do
  rm -f "$entrypoint_marker"
  expect_failure_output "$entrypoint_output" run_release_entrypoint deploy "$invalid_revision"
  assert_contains 'requested revision must be exactly 40 lowercase hexadecimal characters' "$entrypoint_output"
  [[ ! -e "$entrypoint_marker" ]] || fail "invalid revision $invalid_revision reached checkout validation"
done

rm -f "$entrypoint_marker"
expect_failure_output "$entrypoint_output" \
  env BASH_ENV="$entrypoint_env" ENTRYPOINT_MARKER="$entrypoint_marker" \
  bash "$REPO_ROOT/ops/host/release.sh" deploy "$VALID_REVISION"
assert_contains 'release implementation must be invoked through the installed deploy wrapper' "$entrypoint_output"
[[ ! -e "$entrypoint_marker" ]] || fail 'undispatched release invocation reached release_deploy'

# Build an isolated managed checkout. Its target commit contains the exact
# pre-fix arithmetic check, reproducing the observed failure before that
# revision can arm release_deploy's own cleanup. The real stable wrapper must
# return HEAD to the valid revision recorded in current-release.
export TCGPLAYER_INSTALL_DIR="$test_root/checkout"
export TCGPLAYER_CONFIG_DIR="$test_root/config"
export TCGPLAYER_STATE_DIR="$test_root/state"
export TCGPLAYER_LIBEXEC_DIR="$test_root/libexec"
export TCGPLAYER_ENV_FILE="$test_root/config/app.env"
export TCGPLAYER_HOST_CONFIG_FILE="$test_root/config/host.conf"
export TCGPLAYER_BACKUP_DIR="$test_root/state/backups"
export TCGPLAYER_CURRENT_RELEASE_FILE="$test_root/state/current-release"
export TCGPLAYER_PREVIOUS_RELEASE_FILE="$test_root/state/previous-release"
# shellcheck source=../deploy.sh
source "$REPO_ROOT/ops/host/deploy.sh"

remote="$test_root/remote.git"
seed="$test_root/seed"
git init --bare "$remote" >/dev/null
git init -b master "$seed" >/dev/null
git -C "$seed" config user.email release-entrypoint-test@example.invalid
git -C "$seed" config user.name release-entrypoint-test
git -C "$seed" remote add origin "$remote"
mkdir -p "$seed/ops/host"
cat >"$seed/ops/host/release.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'recorded release fixture\n' >/dev/null
EOF
printf 'recorded\n' >"$seed/release.txt"
git -C "$seed" add .
git -C "$seed" commit -m recorded >/dev/null
git -C "$seed" push -u origin master >/dev/null
recorded_revision="$(git -C "$seed" rev-parse HEAD)"

cat >"$seed/ops/host/release.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
main() {
  (($# == 2 && "$1" == "deploy")) || exit 2
  printf 'unexpectedly reached deploy\n' >"${EARLY_FAILURE_REACHED:?}"
}
main "$@"
EOF
printf 'target\n' >"$seed/release.txt"
git -C "$seed" add .
git -C "$seed" commit -m target-with-observed-entrypoint-failure >/dev/null
git -C "$seed" push origin master >/dev/null
target_revision="$(git -C "$seed" rev-parse HEAD)"
git clone "$remote" "$INSTALL_DIR" >/dev/null
REPOSITORY_URL="$(git -C "$INSTALL_DIR" remote get-url origin)"
export REPOSITORY_URL
mkdir -p "$STATE_DIR"
recorded_image="$(local_image_for_revision "$recorded_revision")"
printf '%s\n%s\n' "$recorded_image" "$recorded_revision" >"$CURRENT_RELEASE_FILE"
cp "$CURRENT_RELEASE_FILE" "$test_root/current-release.before-early-failure"
git -C "$INSTALL_DIR" checkout --detach "$recorded_revision" >/dev/null

early_failure_output="$test_root/early-failure.out"
export EARLY_FAILURE_REACHED="$test_root/early-release-reached"
expect_failure_output "$early_failure_output" deploy_revision "$target_revision"
assert_contains 'deploy: unbound variable' "$early_failure_output"
assert_contains "restoring recorded current revision $recorded_revision" "$early_failure_output"
[[ ! -e "$EARLY_FAILURE_REACHED" ]] || fail 'observed early-failure fixture unexpectedly reached deploy work'
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$recorded_revision" ]] ||
  fail 'outer deploy wrapper did not realign checkout after pre-cleanup failure'
cmp -s "$test_root/current-release.before-early-failure" "$CURRENT_RELEASE_FILE" ||
  fail 'outer deploy recovery mutated valid local release state'

# The transition's prior record is accepted only as the exact project-derived
# GHCR digest plus its locally retained, revision-labelled image. Reading it for
# fallback must not adopt or rewrite it.
legacy_image='ghcr.io/goatexe/tcgplayer-automation@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
REPOSITORY_URL='https://github.com/GoatEXE/TCGPlayer-Automation.git'
export REPOSITORY_URL
printf '%s\n%s\n' "$legacy_image" "$recorded_revision" >"$CURRENT_RELEASE_FILE"
cp "$CURRENT_RELEASE_FILE" "$test_root/legacy-current.before-read"
docker() {
  if [[ "${1:-}" == image && "${2:-}" == inspect && "${!#}" == "$legacy_image" ]]; then
    printf '%s\n' "$recorded_revision"
    return 0
  fi
  return 1
}
has_recorded=false
restore_revision=''
load_recorded_checkout_restore_state "$target_revision" has_recorded restore_revision ||
  fail 'exact prior digest-format record was rejected for checkout fallback'
[[ "$has_recorded" == true && "$restore_revision" == "$recorded_revision" ]] ||
  fail 'legacy fallback state did not return the recorded revision'
cmp -s "$test_root/legacy-current.before-read" "$CURRENT_RELEASE_FILE" ||
  fail 'legacy fallback validation rewrote release state'

# Exercise the same wrapper fallback with that legacy record. The temporary
# checkout keeps an exact production-shaped origin URL while the two network
# helpers remain pinned to the isolated test remote's already-fetched target.
git -C "$INSTALL_DIR" remote set-url origin "$REPOSITORY_URL"
git -C "$INSTALL_DIR" checkout --detach "$recorded_revision" >/dev/null
run_legacy_wrapper_failure() (
  remote_master_revision() { printf '%s\n' "$target_revision"; }
  fetch_origin_master() { :; }
  deploy_revision "$target_revision"
)
expect_failure_output "$early_failure_output" run_legacy_wrapper_failure
assert_contains 'deploy: unbound variable' "$early_failure_output"
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$recorded_revision" ]] ||
  fail 'outer deploy wrapper did not realign checkout from exact legacy state'
cmp -s "$test_root/legacy-current.before-read" "$CURRENT_RELEASE_FILE" ||
  fail 'outer deploy recovery adopted or mutated exact legacy state'
unset -f docker

# Invalid state is rejected before the target checkout and remains byte-for-byte
# unchanged. This also proves arbitrary digest-like records are not broadened
# into a checkout recovery authority.
git -C "$INSTALL_DIR" remote set-url origin "$remote"
REPOSITORY_URL="$(git -C "$INSTALL_DIR" remote get-url origin)"
export REPOSITORY_URL
printf '%s\n%s\n' 'ghcr.io/other/project@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$recorded_revision" >"$CURRENT_RELEASE_FILE"
cp "$CURRENT_RELEASE_FILE" "$test_root/invalid-current.before-deploy"
git -C "$INSTALL_DIR" checkout --detach "$recorded_revision" >/dev/null
invalid_state_output="$test_root/invalid-state.out"
expect_failure_output "$invalid_state_output" deploy_revision "$target_revision"
assert_contains 'recorded release state is invalid or cannot be safely restored' "$invalid_state_output"
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$recorded_revision" ]] ||
  fail 'invalid release state changed the managed checkout'
cmp -s "$test_root/invalid-current.before-deploy" "$CURRENT_RELEASE_FILE" ||
  fail 'invalid release state was mutated'

# Documentation invokes these repository scripts directly, so their tracked
# Git modes must remain executable rather than relying on `bash script.sh`.
for documented_script in bootstrap install; do
  assert_contains "sudo ./ops/host/${documented_script}.sh" "$REPO_ROOT/docs/operations/HOST-OPERATIONS.md"
  tracked_mode="$(git -C "$REPO_ROOT" ls-files --stage -- "ops/host/${documented_script}.sh" | awk '{print $1}')"
  [[ "$tracked_mode" == 100755 ]] ||
    fail "ops/host/${documented_script}.sh is documented as directly invoked but tracked as ${tracked_mode:-missing}"
done

echo 'release entrypoint and wrapper recovery tests passed'
