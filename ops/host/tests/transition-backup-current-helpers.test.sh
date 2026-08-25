#!/usr/bin/env bash
set -euo pipefail

# Reproduce the failed first server-build deployment after legacy state adoption:
# the recorded release is 1bb3a8d, whose tracked backup helper still requires
# GHCR_IMAGE_REPOSITORY, while the current release implementation is loaded
# before the checkout switches to that recorded revision.
REPO_ROOT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly TARGET_REVISION="b8d800884740e6c088ed5b6178a1f3072d34d47d"
readonly RECORDED_REVISION="1bb3a8de9dc3a8c131d8a4c1c0e19a7a1449cad4"
readonly REPOSITORY_URL_VALUE='https://github.com/GoatEXE/TCGPlayer-Automation.git'
readonly LEGACY_IMAGE='ghcr.io/goatexe/tcgplayer-automation@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

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

assert_line_before() {
  local first="$1"
  local second="$2"
  local file="$3"
  local first_line second_line

  first_line="$(grep -nF -- "$first" "$file" | head -n 1 | cut -d: -f1)"
  second_line="$(grep -nF -- "$second" "$file" | head -n 1 | cut -d: -f1)"
  [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]] ||
    fail "expected $first before $second in $file"
}

for revision in "$TARGET_REVISION" "$RECORDED_REVISION"; do
  git -C "$REPO_ROOT" cat-file -e "${revision}^{commit}" 2>/dev/null ||
    fail "required historical revision is unavailable: $revision"
done

export TCGPLAYER_INSTALL_DIR="$test_root/checkout"
export TCGPLAYER_CONFIG_DIR="$test_root/config"
export TCGPLAYER_STATE_DIR="$test_root/state"
export TCGPLAYER_LIBEXEC_DIR="$test_root/libexec"
export TCGPLAYER_ENV_FILE="$test_root/config/app.env"
export TCGPLAYER_HOST_CONFIG_FILE="$test_root/config/host.conf"
export TCGPLAYER_BACKUP_DIR="$test_root/state/backups"
export TCGPLAYER_CURRENT_RELEASE_FILE="$test_root/state/current-release"
export TCGPLAYER_PREVIOUS_RELEASE_FILE="$test_root/state/previous-release"

mkdir -p "$TCGPLAYER_CONFIG_DIR" "$TCGPLAYER_STATE_DIR"
cat >"$TCGPLAYER_HOST_CONFIG_FILE" <<EOF
REPOSITORY_URL=$REPOSITORY_URL_VALUE
BACKUP_RETENTION_DAYS=30
EOF
cat >"$TCGPLAYER_ENV_FILE" <<'EOF'
POSTGRES_USER=fixture
POSTGRES_DB=fixture
EOF
if grep -F 'GHCR_IMAGE_REPOSITORY' "$TCGPLAYER_HOST_CONFIG_FILE" >/dev/null; then
  fail 'post-adoption host config unexpectedly contains a GHCR setting'
fi
[[ "$(wc -l < "$TCGPLAYER_HOST_CONFIG_FILE")" -eq 2 ]] ||
  fail 'post-adoption host config should contain only repository and retention settings'

# The managed checkout contains the real historical revision from the failed
# deployment. Point origin at the production-shaped public URL after cloning;
# network checks are deliberately stubbed below, but all Git checkout/ancestry
# behavior remains real.
git clone --quiet "$REPO_ROOT" "$TCGPLAYER_INSTALL_DIR"
git -C "$TCGPLAYER_INSTALL_DIR" remote set-url origin "$REPOSITORY_URL_VALUE"
git -C "$TCGPLAYER_INSTALL_DIR" checkout --quiet --detach "$TARGET_REVISION"
git -C "$TCGPLAYER_INSTALL_DIR" show "$RECORDED_REVISION:ops/host/lib/common.sh" >"$test_root/historical-common.sh"
git -C "$TCGPLAYER_INSTALL_DIR" show "$RECORDED_REVISION:ops/host/backup.sh" >"$test_root/historical-backup.sh"
assert_contains 'GHCR_IMAGE_REPOSITORY is required in host.conf' "$test_root/historical-common.sh"
assert_contains 'load_host_config' "$test_root/historical-backup.sh"

# Load the reviewed implementation once, while the target revision is selected.
# It must remain the implementation that performs the backup after checkout
# temporarily switches to the recorded revision for its Compose file.
# shellcheck source=../lib/common.sh
source "$REPO_ROOT/ops/host/lib/common.sh"
# shellcheck source=../release.sh
source "$REPO_ROOT/ops/host/release.sh"
load_host_config
[[ "$REPOSITORY_URL" == "$REPOSITORY_URL_VALUE" ]] || fail 'host config did not load repository URL'

transition_log="$test_root/transition.log"
docker_log="$test_root/docker.log"
simulated_remote_revision="$TARGET_REVISION"
fail_recorded_backup=false

remote_master_revision() {
  printf '%s\n' "$simulated_remote_revision"
}

fetch_origin_master() {
  :
}

build_local_image() {
  printf 'build image=%s revision=%s\n' "$1" "$2" >>"$transition_log"
}

ensure_local_image() {
  printf 'ensure image=%s revision=%s\n' "$1" "$2" >>"$transition_log"
}

compose_for_release() {
  local image_ref="$1"
  local checkout_revision

  shift
  validate_release_metadata "$image_ref" "${RELEASE_REVISION_FOR_COMPOSE:-}" || return 1
  [[ -r "$ENV_FILE" ]] || return 1
  [[ -r "$COMPOSE_FILE" ]] || return 1
  checkout_revision="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
  printf 'compose checkout=%s image=%s args=%s\n' \
    "$checkout_revision" "$image_ref" "$*" >>"$transition_log"

  if [[ "$*" == *'exec -T db'* ]]; then
    [[ "$fail_recorded_backup" != true ]] || return 1
    printf 'fixture PostgreSQL custom dump for %s\n' "$checkout_revision"
  fi
}

smoke_release() {
  printf 'smoke\n' >>"$transition_log"
}

# Adoption may inspect the old retained image and retag it, but neither this
# transition nor later local releases may contact a registry.
docker() {
  printf '%s\n' "$*" >>"$docker_log"
  case "${1:-} ${2:-}" in
    'image inspect')
      [[ "${!#}" == "$LEGACY_IMAGE" ]] || return 1
      printf '%s\n' "$RECORDED_REVISION"
      ;;
    'tag '*)
      ;;
    *)
      return 1
      ;;
  esac
}

recorded_image="$(local_image_for_revision "$RECORDED_REVISION")"
target_image="$(local_image_for_revision "$TARGET_REVISION")"
printf '%s\n%s\n' "$LEGACY_IMAGE" "$RECORDED_REVISION" >"$CURRENT_RELEASE_FILE"

# Fresh legacy adoption must succeed even though the temporary recorded checkout
# contains the old GHCR-dependent helper. The current in-memory backup helper
# writes a real nonempty dump, metadata, and checksum using that checkout's
# Compose file and the deterministic adopted local image.
release_deploy "$TARGET_REVISION"
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$TARGET_REVISION" ]] ||
  fail 'successful transition backup did not return to the target checkout'
head -n 1 "$CURRENT_RELEASE_FILE" | grep -Fx "$target_image" >/dev/null ||
  fail 'successful transition did not advance current local release state'
head -n 1 "$PREVIOUS_RELEASE_FILE" | grep -Fx "$recorded_image" >/dev/null ||
  fail 'legacy adoption did not preserve the deterministic recorded local image'

backup_file="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'postgres-*.dump' -print -quit)"
[[ -n "$backup_file" && -s "$backup_file" ]] || fail 'current backup helper did not create a nonempty dump'
sha256sum -c "$backup_file.sha256" >/dev/null || fail 'backup checksum did not validate'
assert_contains 'release_state=recorded' "$backup_file.release"
assert_contains "revision=$RECORDED_REVISION" "$backup_file.release"
assert_contains "image=$recorded_image" "$backup_file.release"
assert_line_before \
  "compose checkout=$RECORDED_REVISION image=$recorded_image args=--profile prod exec -T db" \
  "compose checkout=$TARGET_REVISION image=$target_image args=--profile ops run --rm migrate" \
  "$transition_log"

# A backup failure remains fail-closed: checkout and running app return to the
# recorded local release and neither release-state file advances.
git -C "$INSTALL_DIR" checkout --quiet -B fixture-backup-failure "$TARGET_REVISION"
printf 'backup failure fixture\n' >"$INSTALL_DIR/fixture-backup-failure.txt"
git -C "$INSTALL_DIR" add fixture-backup-failure.txt
git -C "$INSTALL_DIR" -c user.name=host-test -c user.email=host-test@example.invalid \
  commit --quiet -m 'fixture backup failure target'
failed_revision="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
git -C "$INSTALL_DIR" checkout --quiet --detach "$failed_revision"
simulated_remote_revision="$failed_revision"
cp "$CURRENT_RELEASE_FILE" "$test_root/current-before-backup-failure"
cp "$PREVIOUS_RELEASE_FILE" "$test_root/previous-before-backup-failure"
fail_recorded_backup=true
if release_deploy "$failed_revision"; then
  fail 'backup failure unexpectedly completed deployment'
fi
fail_recorded_backup=false
cmp -s "$test_root/current-before-backup-failure" "$CURRENT_RELEASE_FILE" ||
  fail 'backup failure advanced current release state'
cmp -s "$test_root/previous-before-backup-failure" "$PREVIOUS_RELEASE_FILE" ||
  fail 'backup failure changed previous release state'
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$TARGET_REVISION" ]] ||
  fail 'backup failure did not restore the recorded current checkout'
assert_contains \
  "compose checkout=$TARGET_REVISION image=$target_image args=--profile prod up -d --no-build app --wait --wait-timeout 120" \
  "$transition_log"

# A normal later deployment starts from the adopted deterministic local state,
# backs up that current local release, and advances state only after migration
# and application readiness.
git -C "$INSTALL_DIR" checkout --quiet -B fixture-later-local-release "$TARGET_REVISION"
printf 'later local release fixture\n' >"$INSTALL_DIR/fixture-later-local-release.txt"
git -C "$INSTALL_DIR" add fixture-later-local-release.txt
git -C "$INSTALL_DIR" -c user.name=host-test -c user.email=host-test@example.invalid \
  commit --quiet -m 'fixture later local release'
later_revision="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
later_image="$(local_image_for_revision "$later_revision")"
git -C "$INSTALL_DIR" checkout --quiet --detach "$later_revision"
simulated_remote_revision="$later_revision"
release_deploy "$later_revision"
head -n 1 "$CURRENT_RELEASE_FILE" | grep -Fx "$later_image" >/dev/null ||
  fail 'later local release did not advance deterministic current state'
head -n 1 "$PREVIOUS_RELEASE_FILE" | grep -Fx "$target_image" >/dev/null ||
  fail 'later local release did not preserve preceding deterministic state'
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$later_revision" ]] ||
  fail 'later local release did not return to its target checkout'
assert_contains \
  "compose checkout=$TARGET_REVISION image=$target_image args=--profile prod exec -T db" \
  "$transition_log"
if grep -E '(^| )(pull|push|login)( |$)' "$docker_log" >/dev/null; then
  fail 'transition backup contacted a container registry'
fi

echo 'transition backup current-helper tests passed'
