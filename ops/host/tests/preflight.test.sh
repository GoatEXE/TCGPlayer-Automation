#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/ops/host/preflight.sh"
readonly CURRENT_REVISION='0123456789abcdef0123456789abcdef01234567'
readonly PREVIOUS_REVISION='89abcdef0123456789abcdef0123456789abcdef'

test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

expect_failure() {
  if "$@" > "$test_root/failure-output" 2>&1; then
    fail "expected failure: $*"
  fi
}

assert_contains() {
  local expected="$1"
  local file="$2"
  grep -Fq -- "$expected" "$file" || fail "missing expected text: $expected"
}

assert_not_contains() {
  local unexpected="$1"
  local file="$2"
  if grep -Fq -- "$unexpected" "$file"; then
    fail "unexpected text present: $unexpected"
  fi
}

install_dir="$test_root/checkout"
config_dir="$test_root/config"
state_dir="$test_root/state"
libexec_dir="$test_root/libexec"
backup_dir="$state_dir/backups"
bin_dir="$test_root/bin"
readonly -a DEPLOY_SSH_RESTRICTIONS=(
  'AuthenticationMethods publickey'
  'PasswordAuthentication no'
  'KbdInteractiveAuthentication no'
  'PermitTTY no'
  'DisableForwarding yes'
  'X11Forwarding no'
  "ForceCommand $libexec_dir/dispatch"
)
readonly -a WEAKENED_DEPLOY_SSH_RESTRICTIONS=(
  'AuthenticationMethods publickey,password'
  'PasswordAuthentication yes'
  'KbdInteractiveAuthentication yes'
  'PermitTTY yes'
  'DisableForwarding no'
  'X11Forwarding yes'
  "ForceCommand $libexec_dir/other-dispatch"
)
mkdir -p "$install_dir/.git" "$config_dir" "$backup_dir" "$libexec_dir" "$bin_dir"
: > "$install_dir/docker-compose.yml"

cat > "$config_dir/host.conf" <<'EOF'
REPOSITORY_URL=https://github.com/GoatEXE/TCGPlayer-Automation.git
BACKUP_RETENTION_DAYS=30
EOF
cat > "$config_dir/app.env" <<'EOF'
APP_HOST_PORT=3001
POSTGRES_PASSWORD=do-not-print-host-password
EOF
printf '%s\n%s\n' \
  "tcgplayer-automation:revision-${CURRENT_REVISION}" \
  "$CURRENT_REVISION" > "$state_dir/current-release"
printf '%s\n%s\n' \
  "tcgplayer-automation:revision-${PREVIOUS_REVISION}" \
  "$PREVIOUS_REVISION" > "$state_dir/previous-release"

backup_file="$backup_dir/postgres-20260825T000000Z-${CURRENT_REVISION:0:12}.dump"
printf 'test database backup\n' > "$backup_file"
printf 'created_at=20260825T000000Z\nrelease_state=recorded\nrevision=%s\nimage=tcgplayer-automation:revision-%s\n' \
  "$CURRENT_REVISION" "$CURRENT_REVISION" > "$backup_file.release"
sha256sum "$backup_file" > "$backup_file.sha256"

# Install exact stable copies with the same modes install.sh enforces.
cp "$REPO_ROOT/ops/host/lib/common.sh" "$libexec_dir/common.sh"
chmod 0644 "$libexec_dir/common.sh"
for script_name in status logs backup deploy rollback smoke preflight; do
  cp "$REPO_ROOT/ops/host/${script_name}.sh" "$libexec_dir/$script_name"
  chmod 0750 "$libexec_dir/$script_name"
done
cp "$REPO_ROOT/ops/host/dispatch.sh" "$libexec_dir/dispatch"
chmod 0755 "$libexec_dir/dispatch"
if [[ "$(id -u)" -eq 0 ]]; then
  chown -R root:root "$libexec_dir"
fi

sudoers_file="$test_root/tcgplayer-automation-deploy"
sshd_file="$test_root/90-tcgplayer-automation-deploy.conf"
printf 'deploy ALL=(root) NOPASSWD: %s/deploy *\n' "$libexec_dir" > "$sudoers_file"

# Duplicate every required directive globally and in an unrelated Match block.
# The check must only accept the copies within `Match User deploy`.
write_sshd_config() {
  local target_directive="${1:-}"
  local replacement="${2:-}"
  local directive

  {
    printf '# These directive copies must not satisfy the deploy Match audit.\n'
    for directive in "${DEPLOY_SSH_RESTRICTIONS[@]}"; do
      printf '%s\n' "$directive"
    done
    printf '\nMatch User unrelated\n'
    for directive in "${DEPLOY_SSH_RESTRICTIONS[@]}"; do
      printf '    %s\n' "$directive"
    done
    printf '\nMatch User deploy\n'
    for directive in "${DEPLOY_SSH_RESTRICTIONS[@]}"; do
      if [[ "$directive" == "$target_directive" ]]; then
        [[ -n "$replacement" ]] && printf '    %s\n' "$replacement"
      else
        printf '    %s\n' "$directive"
      fi
    done
    printf '\nMatch User another-user\n    PasswordAuthentication yes\n'
  } > "$sshd_file"
}

write_sshd_config

cat > "$bin_dir/git" <<'MOCK_GIT'
#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\n' "$*" >> "$PREFLIGHT_CALL_LOG"
while (($#)); do
  case "$1" in
    -C | -c)
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
case "${1:-}" in
  rev-parse)
    case "${2:-}" in
      --show-toplevel) printf '%s\n' "$TCGPLAYER_INSTALL_DIR" ;;
      HEAD) printf '%s\n' "$PREFLIGHT_CURRENT_REVISION" ;;
      *) exit 64 ;;
    esac
    ;;
  remote)
    [[ "${2:-}" == get-url && "${3:-}" == origin ]] || exit 64
    printf '%s\n' 'https://github.com/GoatEXE/TCGPlayer-Automation.git'
    ;;
  status)
    [[ "${2:-}" == --porcelain* ]] || exit 64
    ;;
  merge-base)
    [[ "${2:-}" == --is-ancestor ]] || exit 64
    ;;
  *)
    exit 64
    ;;
esac
MOCK_GIT

cat > "$bin_dir/docker" <<'MOCK_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >> "$PREFLIGHT_CALL_LOG"
case "${1:-}" in
  image)
    [[ "${2:-}" == inspect ]] || exit 64
    format="${4:-}"
    image_ref="${!#}"
    case "$format" in
      *'.Id'*)
        case "$image_ref" in
          "$PREFLIGHT_APP_IMAGE_ID") printf '%s\n' "$PREFLIGHT_APP_IMAGE_ID" ;;
          *"$PREFLIGHT_CURRENT_REVISION") printf '%s\n' "$PREFLIGHT_CURRENT_IMAGE_ID" ;;
          *"$PREFLIGHT_PREVIOUS_REVISION") printf '%s\n' 'sha256:previous-image' ;;
          *) exit 1 ;;
        esac
        ;;
      *'org.opencontainers.image.revision'*)
        case "$image_ref" in
          "$PREFLIGHT_APP_IMAGE_ID") printf '%s\n' "$PREFLIGHT_APP_IMAGE_REVISION" ;;
          *"$PREFLIGHT_CURRENT_REVISION") printf '%s\n' "$PREFLIGHT_CURRENT_REVISION" ;;
          *"$PREFLIGHT_PREVIOUS_REVISION") printf '%s\n' "$PREFLIGHT_PREVIOUS_REVISION" ;;
          *) exit 1 ;;
        esac
        ;;
      *) exit 64 ;;
    esac
    ;;
  volume)
    [[ "${2:-}" == inspect ]] || exit 64
    case "${3:-}" in
      tcgplayer-automation_pgdata | tcgplayer-automation_redisdata) printf '[]\n' ;;
      *) exit 1 ;;
    esac
    ;;
  compose)
    service="${!#}"
    [[ "$*" == *' ps -q '* ]] || exit 64
    case "$service" in
      db | redis | app) printf '%s-container\n' "$service" ;;
      *) exit 1 ;;
    esac
    ;;
  inspect)
    [[ "${2:-}" == --format ]] || exit 64
    case "${3:-}" in
      *'.State.Status'*) printf 'running healthy\n' ;;
      *'.Config.Image'*) printf '%s\n' "$PREFLIGHT_APP_CONFIGURED_IMAGE" ;;
      *'.Image'*) printf '%s\n' "$PREFLIGHT_APP_IMAGE_ID" ;;
      *) exit 64 ;;
    esac
    ;;
  *)
    exit 64
    ;;
esac
MOCK_DOCKER

cat > "$bin_dir/stat" <<'MOCK_STAT'
#!/usr/bin/env bash
set -euo pipefail

# Git for Windows cannot represent the installed Linux modes. The preflight
# test supplies the modes install.sh would set, while production uses stat.
if [[ "${1:-}" == -c && "${2:-}" == '%a' ]]; then
  case "${3##*/}" in
    common.sh) printf '644\n' ;;
    dispatch) printf '755\n' ;;
    *) printf '750\n' ;;
  esac
  exit 0
fi
if [[ "${1:-}" == -c && "${2:-}" == '%U:%G' ]]; then
  printf 'root:root\n'
  exit 0
fi
exit 64
MOCK_STAT
cat > "$bin_dir/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> "$PREFLIGHT_CALL_LOG"
MOCK_CURL
cat > "$bin_dir/visudo" <<'MOCK_VISUDO'
#!/usr/bin/env bash
set -euo pipefail
printf 'visudo %s\n' "$*" >> "$PREFLIGHT_CALL_LOG"
MOCK_VISUDO
cat > "$bin_dir/sshd" <<'MOCK_SSHD'
#!/usr/bin/env bash
set -euo pipefail
printf 'sshd %s\n' "$*" >> "$PREFLIGHT_CALL_LOG"
MOCK_SSHD
chmod +x "$bin_dir/git" "$bin_dir/docker" "$bin_dir/stat" "$bin_dir/curl" "$bin_dir/visudo" "$bin_dir/sshd"

run_preflight() {
  PATH="$bin_dir:$PATH" \
    PREFLIGHT_CALL_LOG="$test_root/calls.log" \
    PREFLIGHT_CURRENT_REVISION="$CURRENT_REVISION" \
    PREFLIGHT_PREVIOUS_REVISION="$PREVIOUS_REVISION" \
    PREFLIGHT_CURRENT_IMAGE_ID="${PREFLIGHT_CURRENT_IMAGE_ID:-sha256:current-image}" \
    PREFLIGHT_APP_CONFIGURED_IMAGE="${PREFLIGHT_APP_CONFIGURED_IMAGE:-tcgplayer-automation:revision-${CURRENT_REVISION}}" \
    PREFLIGHT_APP_IMAGE_ID="${PREFLIGHT_APP_IMAGE_ID:-sha256:current-image}" \
    PREFLIGHT_APP_IMAGE_REVISION="${PREFLIGHT_APP_IMAGE_REVISION:-$CURRENT_REVISION}" \
    TCGPLAYER_INSTALL_DIR="$install_dir" \
    TCGPLAYER_CONFIG_DIR="$config_dir" \
    TCGPLAYER_STATE_DIR="$state_dir" \
    TCGPLAYER_LIBEXEC_DIR="$libexec_dir" \
    TCGPLAYER_ENV_FILE="$config_dir/app.env" \
    TCGPLAYER_HOST_CONFIG_FILE="$config_dir/host.conf" \
    TCGPLAYER_BACKUP_DIR="$backup_dir" \
    TCGPLAYER_CURRENT_RELEASE_FILE="$state_dir/current-release" \
    TCGPLAYER_PREVIOUS_RELEASE_FILE="$state_dir/previous-release" \
    TCGPLAYER_HOST_OPS_SOURCE_DIR="$REPO_ROOT/ops/host" \
    TCGPLAYER_DEPLOY_SUDOERS_FILE="$sudoers_file" \
    TCGPLAYER_DEPLOY_SSHD_CONFIG_FILE="$sshd_file" \
    bash "$SCRIPT"
}

: > "$test_root/calls.log"
release_before="$(sha256sum "$state_dir/current-release" "$state_dir/previous-release" "$backup_file" "$backup_file.release" "$backup_file.sha256")"
run_preflight > "$test_root/preflight-output"
release_after="$(sha256sum "$state_dir/current-release" "$state_dir/previous-release" "$backup_file" "$backup_file.release" "$backup_file.sha256")"
[[ "$release_before" == "$release_after" ]] || fail 'read-only preflight changed release or backup files'
assert_contains 'Read-only production host preflight' "$test_root/preflight-output"
assert_contains 'production Compose services db, redis, and app are running and healthy' "$test_root/preflight-output"
assert_contains 'running app container image and OCI revision match current recorded release' "$test_root/preflight-output"
assert_contains 'No host state was changed' "$test_root/preflight-output"
assert_not_contains 'do-not-print-host-password' "$test_root/preflight-output"
assert_not_contains 'git fetch' "$test_root/calls.log"
assert_not_contains 'git checkout' "$test_root/calls.log"
assert_not_contains 'compose up' "$test_root/calls.log"
assert_not_contains 'compose down' "$test_root/calls.log"

# A correct directive elsewhere must not mask an absent or weakened setting in
# the deploy Match block. This also keeps ForceCommand scoped to that block.
for index in "${!DEPLOY_SSH_RESTRICTIONS[@]}"; do
  directive="${DEPLOY_SSH_RESTRICTIONS[$index]}"
  weakened_directive="${WEAKENED_DEPLOY_SSH_RESTRICTIONS[$index]}"

  write_sshd_config "$directive"
  : > "$test_root/calls.log"
  expect_failure run_preflight
  assert_contains 'deploy SSH Match block, forced-command, and sudo boundary are restricted' "$test_root/failure-output"

  write_sshd_config "$directive" "$weakened_directive"
  : > "$test_root/calls.log"
  expect_failure run_preflight
  assert_contains 'deploy SSH Match block, forced-command, and sudo boundary are restricted' "$test_root/failure-output"
done
write_sshd_config

# Health remains good here, but the container is configured from the previous
# image and its inspected OCI label is the previous revision.
run_preflight_with_stale_app() {
  PREFLIGHT_APP_CONFIGURED_IMAGE="tcgplayer-automation:revision-${PREVIOUS_REVISION}" \
    PREFLIGHT_APP_IMAGE_ID='sha256:previous-image' \
    PREFLIGHT_APP_IMAGE_REVISION="$PREVIOUS_REVISION" \
    run_preflight
}
: > "$test_root/calls.log"
expect_failure run_preflight_with_stale_app
assert_contains 'production Compose services db, redis, and app are running and healthy' "$test_root/failure-output"
assert_contains 'running app container image and OCI revision match current recorded release' "$test_root/failure-output"
assert_contains 'docker inspect --format {{.Config.Image}} app-container' "$test_root/calls.log"
assert_contains 'docker inspect --format {{.Image}} app-container' "$test_root/calls.log"
assert_contains "docker image inspect --format {{.Id}} tcgplayer-automation:revision-${CURRENT_REVISION}" "$test_root/calls.log"
assert_contains 'docker image inspect --format {{ index .Config.Labels "org.opencontainers.image.revision" }} sha256:previous-image' "$test_root/calls.log"

cp "$config_dir/host.conf" "$test_root/host.conf.before-ghcr"
printf 'GHCR_IMAGE_REPOSITORY=ghcr.io/example/retired\n' >> "$config_dir/host.conf"
: > "$test_root/calls.log"
expect_failure run_preflight
assert_contains 'contain no active GHCR configuration' "$test_root/failure-output"
assert_not_contains 'git fetch' "$test_root/calls.log"
assert_not_contains 'git checkout' "$test_root/calls.log"
cp "$test_root/host.conf.before-ghcr" "$config_dir/host.conf"

printf 'invalid-image\n%s\n' "$CURRENT_REVISION" > "$state_dir/current-release"
: > "$test_root/calls.log"
expect_failure run_preflight
assert_contains 'current and/or previous release metadata is invalid' "$test_root/failure-output"
assert_not_contains 'git fetch' "$test_root/calls.log"
assert_not_contains 'git checkout' "$test_root/calls.log"

echo 'host preflight tests passed'
