#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly VALID_REVISION="0123456789abcdef0123456789abcdef01234567"
readonly OTHER_REVISION="89abcdef0123456789abcdef0123456789abcdef"

test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    fail "expected command to fail: $*"
  fi
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

# Server-build release state accepts only the deterministic local tag for one
# exact revision. Source the shared helpers with isolated state paths.
export TCGPLAYER_INSTALL_DIR="$test_root/checkout"
export TCGPLAYER_CONFIG_DIR="$test_root/config"
export TCGPLAYER_STATE_DIR="$test_root/state"
export TCGPLAYER_LIBEXEC_DIR="$test_root/libexec"
export TCGPLAYER_ENV_FILE="$test_root/config/app.env"
export TCGPLAYER_HOST_CONFIG_FILE="$test_root/config/host.conf"
export TCGPLAYER_BACKUP_DIR="$test_root/state/backups"
export TCGPLAYER_CURRENT_RELEASE_FILE="$test_root/state/current-release"
export TCGPLAYER_PREVIOUS_RELEASE_FILE="$test_root/state/previous-release"
# shellcheck source=../lib/common.sh
source "$REPO_ROOT/ops/host/lib/common.sh"

expected_image="tcgplayer-automation:revision-${VALID_REVISION}"
[[ "$(local_image_for_revision "$VALID_REVISION")" == "$expected_image" ]] ||
  fail 'revision-specific local image tag was not derived deterministically'
expect_failure local_image_for_revision short-sha
expect_failure validate_release_metadata "tcgplayer-automation:latest" "$VALID_REVISION"
expect_failure validate_release_metadata "$expected_image" short-sha
expect_failure validate_release_metadata "registry.example/app@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" "$VALID_REVISION"

# Exercise the safe checkout guard against a real local Git remote. A valid
# current master revision updates the detached checkout; a stale request and a
# dirty checkout must fail before changing HEAD or origin/master.
remote="$test_root/remote.git"
seed="$test_root/seed"
git init --bare "$remote" >/dev/null
git init -b master "$seed" >/dev/null
git -C "$seed" config user.email host-ops-test@example.invalid
git -C "$seed" config user.name host-ops-test
git -C "$seed" remote add origin "$remote"
printf 'first\n' > "$seed/release.txt"
git -C "$seed" add release.txt
git -C "$seed" commit -m first >/dev/null
git -C "$seed" push -u origin master >/dev/null
git clone "$remote" "$INSTALL_DIR" >/dev/null

git -C "$seed" rev-parse HEAD > "$test_root/first-revision"
printf 'second\n' > "$seed/release.txt"
git -C "$seed" commit -am second >/dev/null
git -C "$seed" push origin master >/dev/null
second_revision="$(git -C "$seed" rev-parse HEAD)"
REPOSITORY_URL="$(git -C "$INSTALL_DIR" remote get-url origin)"
export REPOSITORY_URL
prepare_checkout_for_deploy "$second_revision"
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$second_revision" ]] ||
  fail 'safe checkout did not select the requested origin/master revision'
[[ "$(git -C "$INSTALL_DIR" rev-parse refs/remotes/origin/master)" == "$second_revision" ]] ||
  fail 'safe checkout did not fetch origin/master'

printf 'third\n' > "$seed/release.txt"
git -C "$seed" commit -am third >/dev/null
git -C "$seed" push origin master >/dev/null
head_before_rejection="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
origin_before_rejection="$(git -C "$INSTALL_DIR" rev-parse refs/remotes/origin/master)"
expect_failure prepare_checkout_for_deploy "$second_revision"
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$head_before_rejection" ]] ||
  fail 'stale deploy request changed checkout HEAD'
[[ "$(git -C "$INSTALL_DIR" rev-parse refs/remotes/origin/master)" == "$origin_before_rejection" ]] ||
  fail 'stale deploy request changed origin/master'
printf 'unsafe local drift\n' > "$INSTALL_DIR/untracked-drift"
expect_failure prepare_checkout_for_deploy "$(git -C "$seed" rev-parse HEAD)"
[[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$head_before_rejection" ]] ||
  fail 'dirty checkout changed checkout HEAD'
rm "$INSTALL_DIR/untracked-drift"

# A host upgraded from the prior accepted pipeline has two exact GHCR digest
# records. Adoption only permits the repository-derived legacy format, verifies
# locally retained image labels and ancestry before mutation, archives both
# records, and retags them without contacting a registry.
target_revision="$(git -C "$seed" rev-parse HEAD)"
prepare_checkout_for_deploy "$target_revision"
first_revision="$(cat "$test_root/first-revision")"
REPOSITORY_URL='https://github.com/GoatEXE/TCGPlayer-Automation.git'
export REPOSITORY_URL
legacy_current_image="ghcr.io/goatexe/tcgplayer-automation@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
legacy_previous_image="ghcr.io/goatexe/tcgplayer-automation@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
legacy_tag_log="$test_root/legacy-tags.log"
mkdir -p "$TCGPLAYER_STATE_DIR"
printf '%s\n%s\n' 'arbitrary-image-reference' "$second_revision" > "$TCGPLAYER_CURRENT_RELEASE_FILE"
invalid_state_copy="$test_root/invalid-current-release"
cp "$TCGPLAYER_CURRENT_RELEASE_FILE" "$invalid_state_copy"
invalid_entries_before="$(find "$TCGPLAYER_STATE_DIR" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)"
expect_failure adopt_legacy_release_state "$target_revision"
cmp -s "$invalid_state_copy" "$TCGPLAYER_CURRENT_RELEASE_FILE" ||
  fail 'arbitrary invalid current state was mutated during rejected adoption'
[[ "$(find "$TCGPLAYER_STATE_DIR" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "$invalid_entries_before" ]] ||
  fail 'rejected arbitrary state created adoption artifacts'

printf '%s\n%s\n' "$legacy_current_image" "$second_revision" > "$TCGPLAYER_CURRENT_RELEASE_FILE"
printf '%s\n%s\n' "$legacy_previous_image" "$first_revision" > "$TCGPLAYER_PREVIOUS_RELEASE_FILE"
legacy_labels_match=false
docker() {
  if [[ "${1:-}" == image && "${2:-}" == inspect ]]; then
    [[ "$legacy_labels_match" == true ]] || {
      printf '%s\n' 'mismatched-label'
      return 0
    }
    case "${!#}" in
      "$legacy_current_image") printf '%s\n' "$second_revision" ;;
      "$legacy_previous_image") printf '%s\n' "$first_revision" ;;
      *) return 1 ;;
    esac
  elif [[ "${1:-}" == tag ]]; then
    printf '%s\n' "$*" >> "$legacy_tag_log"
  else
    return 1
  fi
}
valid_state_current_copy="$test_root/valid-current-before-label-rejection"
valid_state_previous_copy="$test_root/valid-previous-before-label-rejection"
cp "$TCGPLAYER_CURRENT_RELEASE_FILE" "$valid_state_current_copy"
cp "$TCGPLAYER_PREVIOUS_RELEASE_FILE" "$valid_state_previous_copy"
expect_failure adopt_legacy_release_state "$target_revision"
cmp -s "$valid_state_current_copy" "$TCGPLAYER_CURRENT_RELEASE_FILE" ||
  fail 'label-rejected legacy current state was mutated'
cmp -s "$valid_state_previous_copy" "$TCGPLAYER_PREVIOUS_RELEASE_FILE" ||
  fail 'label-rejected legacy previous state was mutated'
legacy_labels_match=true
adopt_legacy_release_state "$target_revision"
local_current_image="tcgplayer-automation:revision-${second_revision}"
local_previous_image="tcgplayer-automation:revision-${first_revision}"
head -n 1 "$TCGPLAYER_CURRENT_RELEASE_FILE" | grep -Fx "$local_current_image" >/dev/null ||
  fail 'legacy current release was not retagged to deterministic local metadata'
head -n 1 "$TCGPLAYER_PREVIOUS_RELEASE_FILE" | grep -Fx "$local_previous_image" >/dev/null ||
  fail 'legacy previous release was not retagged to deterministic local metadata'
archive_dir="$(find "$TCGPLAYER_STATE_DIR" -mindepth 1 -maxdepth 1 -type d -name 'legacy-release-adoption.*' -print -quit)"
[[ -n "$archive_dir" ]] || fail 'legacy state was not safely archived'
assert_contains "$legacy_current_image" "$archive_dir/current-release"
assert_contains "$legacy_previous_image" "$archive_dir/previous-release"
assert_contains "tag ${legacy_current_image} ${local_current_image}" "$legacy_tag_log"
assert_contains "tag ${legacy_previous_image} ${local_previous_image}" "$legacy_tag_log"
unset -f docker
# Restore the local test remote for actual recorded-checkout restoration below.
REPOSITORY_URL="$(git -C "$INSTALL_DIR" remote get-url origin)"
export REPOSITORY_URL

# The forced dispatcher permits exactly one revision argument and never accepts
# an image reference. Invalid input must not reach sudo/root deployment.
mkdir -p "$TCGPLAYER_CONFIG_DIR" "$test_root/bin"
cat > "$TCGPLAYER_HOST_CONFIG_FILE" <<'EOF'
REPOSITORY_URL=https://github.com/GoatEXE/TCGPlayer-Automation.git
BACKUP_RETENTION_DAYS=30
EOF
sudo_log="$test_root/sudo.log"
cat > "$test_root/bin/sudo" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" > "$sudo_log"
EOF
chmod +x "$test_root/bin/sudo"
PATH="$test_root/bin:$PATH"
export PATH
export SSH_ORIGINAL_COMMAND="deploy ${VALID_REVISION}"
bash "$REPO_ROOT/ops/host/dispatch.sh"
assert_contains "$VALID_REVISION" "$sudo_log"
: > "$sudo_log"
export SSH_ORIGINAL_COMMAND="deploy ${VALID_REVISION} unexpected"
expect_failure bash "$REPO_ROOT/ops/host/dispatch.sh"
[[ ! -s "$sudo_log" ]] || fail 'rejected dispatcher input reached sudo'

# Build orchestration has no Docker dependency in this test: replace effects
# with functions and assert local tag propagation plus data/migration/app order.
source "$REPO_ROOT/ops/host/release.sh"

# The checkout is already at the requested target when release.sh starts. A
# failure before app readiness used to leave that target Compose file paired
# with the recorded old release. Exercise the adopted state first, then each
# early failure point, and require both state files and checkout to be restored.
run_early_failure_case() {
  local stage="$1"
  local state_current_copy="$test_root/${stage}-current-before"
  local state_previous_copy="$test_root/${stage}-previous-before"
  local transition_log="$test_root/${stage}-transition.log"
  local target_image="tcgplayer-automation:revision-${target_revision}"

  cp "$TCGPLAYER_CURRENT_RELEASE_FILE" "$state_current_copy"
  cp "$TCGPLAYER_PREVIOUS_RELEASE_FILE" "$state_previous_copy"
  git -C "$INSTALL_DIR" checkout --detach "$target_revision" >/dev/null
  : > "$transition_log"
  if (
    build_local_image() {
      printf 'build %s %s\n' "$1" "$2" >> "$transition_log"
      [[ "$stage" != build ]]
    }
    compose_for_release() {
      local image_ref="$1"
      shift
      printf 'compose %s %s\n' "$image_ref" "$*" >> "$transition_log"
      if [[ "$image_ref" == "$target_image" && "$stage" == data-services && "$*" == *'db redis'* ]]; then
        return 1
      fi
      if [[ "$image_ref" == "$target_image" && "$stage" == migration && "$*" == *'run --rm migrate'* ]]; then
        return 1
      fi
    }
    backup_for_release() {
      printf 'backup checkout=%s %s\n' "$(git -C "$INSTALL_DIR" rev-parse HEAD)" "$*" >> "$transition_log"
      [[ "$stage" != backup ]]
    }
    ensure_local_image() {
      printf 'ensure %s %s\n' "$1" "$2" >> "$transition_log"
    }
    smoke_release() {
      printf 'smoke\n' >> "$transition_log"
    }
    release_deploy "$target_revision"
  ); then
    fail "expected ${stage} deploy failure"
  fi

  cmp -s "$state_current_copy" "$TCGPLAYER_CURRENT_RELEASE_FILE" ||
    fail "${stage} failure changed current release state"
  cmp -s "$state_previous_copy" "$TCGPLAYER_PREVIOUS_RELEASE_FILE" ||
    fail "${stage} failure changed previous release state"
  [[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$second_revision" ]] ||
    fail "${stage} failure did not restore the recorded current checkout"
  assert_contains "compose ${local_current_image} --profile prod up -d --no-build app --wait --wait-timeout 120" "$transition_log"
  if [[ "$stage" == backup || "$stage" == migration ]]; then
    assert_contains "backup checkout=${second_revision}" "$transition_log"
  fi
}

run_early_failure_case build
run_early_failure_case data-services
run_early_failure_case backup
run_early_failure_case migration

# The first failed local-build deployment after adoption left the converted old
# state intact and restored its checkout, so an operator can retry or roll back.
head -n 1 "$TCGPLAYER_CURRENT_RELEASE_FILE" | grep -Fx "$local_current_image" >/dev/null ||
  fail 'failed first server-build deployment lost adopted current release state'
rm -f "$TCGPLAYER_CURRENT_RELEASE_FILE" "$TCGPLAYER_PREVIOUS_RELEASE_FILE"

release_log="$test_root/release.log"
assert_checkout_at_revision() { printf 'checkout %s\n' "$1" >> "$release_log"; }
validate_deployment_progression() { :; }
docker() {
  printf 'docker' >> "$release_log"
  printf ' %q' "$@" >> "$release_log"
  printf '\n' >> "$release_log"
  if [[ "${1:-}" == image && "${2:-}" == inspect ]]; then
    printf '%s\n' "$VALID_REVISION"
  fi
}
compose_for_release() {
  printf 'compose %s' "$1" >> "$release_log"
  shift
  printf ' %q' "$@" >> "$release_log"
  printf '\n' >> "$release_log"
}
backup_for_release() { printf 'backup %s %s\n' "$1" "$2" >> "$release_log"; }
smoke_release() { printf 'smoke\n' >> "$release_log"; }
release_deploy "$VALID_REVISION"
assert_contains "--build-arg VCS_REF=${VALID_REVISION}" "$release_log"
assert_contains "--tag ${expected_image}" "$release_log"
assert_line_before "up -d --no-build db redis --wait --wait-timeout 120" "backup ${expected_image}" "$release_log"
assert_line_before "backup ${expected_image}" "--profile ops run --rm migrate" "$release_log"
assert_line_before "--profile ops run --rm migrate" "--profile prod up -d --no-build app --wait --wait-timeout 120" "$release_log"
assert_line_before "--profile prod up -d --no-build app --wait --wait-timeout 120" smoke "$release_log"
assert_contains "$expected_image" "$TCGPLAYER_CURRENT_RELEASE_FILE"
assert_contains "$VALID_REVISION" "$TCGPLAYER_CURRENT_RELEASE_FILE"

# A successful rollback swaps recorded local releases and uses the previous
# revision's checkout/image; a failed readiness must leave release state alone.
printf '%s\n%s\n' "tcgplayer-automation:revision-${OTHER_REVISION}" "$OTHER_REVISION" > "$TCGPLAYER_CURRENT_RELEASE_FILE"
printf '%s\n%s\n' "$expected_image" "$VALID_REVISION" > "$TCGPLAYER_PREVIOUS_RELEASE_FILE"
: > "$release_log"
source "$REPO_ROOT/ops/host/rollback.sh"
prepare_checkout_for_recorded_release() { printf 'rollback-checkout %s\n' "$1" >> "$release_log"; }
ensure_local_image() { printf 'ensure-image %s %s\n' "$1" "$2" >> "$release_log"; }
backup_recorded_release() { printf 'rollback-backup\n' >> "$release_log"; }
rollback_release
assert_contains "rollback-checkout ${VALID_REVISION}" "$release_log"
assert_contains "ensure-image ${expected_image} ${VALID_REVISION}" "$release_log"
head -n 1 "$TCGPLAYER_CURRENT_RELEASE_FILE" | grep -Fx "$expected_image" >/dev/null ||
  fail 'successful rollback did not promote previous local image'
head -n 1 "$TCGPLAYER_PREVIOUS_RELEASE_FILE" | grep -Fx "tcgplayer-automation:revision-${OTHER_REVISION}" >/dev/null ||
  fail 'successful rollback did not preserve current image as previous'

# Compose migration waits for both data services. Legacy GHCR text is limited
# to the one-time metadata parser; no workflow or host path may publish, pull,
# log in to, or configure a registry.
unset -f docker
compose_render="$(COMPOSE_PROFILES=prod APP_IMAGE="$expected_image" APP_ENV_FILE="$REPO_ROOT/ops/host/config/app.env.example" docker compose --env-file "$REPO_ROOT/ops/host/config/app.env.example" --file "$REPO_ROOT/docker-compose.yml" --profile ops config)"
printf '%s\n' "$compose_render" | grep -A20 '^  migrate:' | grep -F 'redis:' >/dev/null ||
  fail 'migration service does not depend on Redis'
printf '%s\n' "$compose_render" | grep -A20 '^  migrate:' | grep -F 'condition: service_healthy' >/dev/null ||
  fail 'migration service does not wait for healthy data services'
if grep -RInE 'docker[[:space:]]+(pull|push|login)|GHCR_IMAGE_REPOSITORY' \
  "$REPO_ROOT/.github" "$REPO_ROOT/docker-compose.yml" "$REPO_ROOT/docs" \
  "$REPO_ROOT/ops/host" --exclude='*.test.sh'; then
  fail 'registry publishing, pulling, login, or configuration remains'
fi
if grep -RInE '^[[:space:]]*packages:' "$REPO_ROOT/.github/workflows"; then
  fail 'workflow package permission remains'
fi
if grep -RInE 'deploy[[:space:]].*(sha256|image)' "$REPO_ROOT/.github/workflows/release-production.yml"; then
  fail 'release workflow still dispatches an image or digest'
fi
assert_contains 'workflow_run:' "$REPO_ROOT/.github/workflows/release-production.yml"
assert_contains 'name: production' "$REPO_ROOT/.github/workflows/release-production.yml"
assert_contains '"deploy ${RELEASE_REVISION}"' "$REPO_ROOT/.github/workflows/release-production.yml"
assert_contains 'test "$(git rev-parse HEAD)" = "$RELEASE_REVISION"' \
  "$REPO_ROOT/.github/workflows/release-production.yml"

echo 'server-build deployment tests passed'
