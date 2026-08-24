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

# Compose migration waits for both data services, and repository sources no
# longer retain registry-specific deploy references or package permissions.
unset -f docker
compose_render="$(COMPOSE_PROFILES=prod APP_IMAGE="$expected_image" APP_ENV_FILE="$REPO_ROOT/ops/host/config/app.env.example" docker compose --env-file "$REPO_ROOT/ops/host/config/app.env.example" --file "$REPO_ROOT/docker-compose.yml" --profile ops config)"
printf '%s\n' "$compose_render" | grep -A20 '^  migrate:' | grep -F 'redis:' >/dev/null ||
  fail 'migration service does not depend on Redis'
printf '%s\n' "$compose_render" | grep -A20 '^  migrate:' | grep -F 'condition: service_healthy' >/dev/null ||
  fail 'migration service does not wait for healthy data services'
registry_pattern='gh''cr\.io|GH''CR_'
if grep -RInE "$registry_pattern" \
  "$REPO_ROOT/.github" "$REPO_ROOT/docker-compose.yml" "$REPO_ROOT/docs" \
  "$REPO_ROOT/ops/host"; then
  fail 'registry-specific deployment references remain'
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
