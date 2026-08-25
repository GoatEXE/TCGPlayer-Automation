#!/usr/bin/env bash
# Read-only production-host audit. It never fetches, checks out, builds, starts,
# stops, or removes anything.
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -r "$SCRIPT_DIR/common.sh" ]]; then
  # Installed stable wrapper.
  # shellcheck source=lib/common.sh
  source "$SCRIPT_DIR/common.sh"
  HOST_OPS_SOURCE_DIR="${TCGPLAYER_HOST_OPS_SOURCE_DIR:-$INSTALL_DIR/ops/host}"
else
  # Versioned checkout copy, useful before installation.
  # shellcheck source=lib/common.sh
  source "$SCRIPT_DIR/lib/common.sh"
  HOST_OPS_SOURCE_DIR="${TCGPLAYER_HOST_OPS_SOURCE_DIR:-$SCRIPT_DIR}"
fi

readonly DEPLOY_SUDOERS_FILE="${TCGPLAYER_DEPLOY_SUDOERS_FILE:-/etc/sudoers.d/tcgplayer-automation-deploy}"
readonly DEPLOY_SSHD_CONFIG_FILE="${TCGPLAYER_DEPLOY_SSHD_CONFIG_FILE:-/etc/ssh/sshd_config.d/90-tcgplayer-automation-deploy.conf}"
readonly RETIRED_REGISTRY_HOST='ghcr.io'

CURRENT_IMAGE=''
CURRENT_REVISION=''
PREVIOUS_IMAGE=''
PREVIOUS_REVISION=''
HAS_PREVIOUS=false
FAILURES=0

usage() {
  cat <<'USAGE'
Usage: sudo /usr/local/libexec/tcgplayer-automation/preflight

Runs a read-only audit of the managed production host. It verifies the clean,
recorded checkout; stable-wrapper parity; release image labels; production
Compose health, app image/revision provenance, and /ready; latest backup
checksum/metadata; named volumes; public repository/no-GHCR configuration; and
the deploy SSH/sudo boundary.

Run the installed command with sudo for full ownership and restricted-file
checks. It does not fetch Git, change the checkout, build images, run Compose
up/down, create backups, or modify any host/GitHub setting.
USAGE
}

pass() {
  printf 'PASS: %s\n' "$*"
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

check() {
  local description="$1"
  shift

  if "$@" >/dev/null 2>&1; then
    pass "$description"
  else
    fail "$description"
  fi
}

require_commands() {
  local command_name
  local missing=false

  for command_name in awk cmp curl docker find git grep head sha256sum sort stat; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      printf 'FAIL: required command not found: %s\n' "$command_name" >&2
      missing=true
    fi
  done
  [[ "$missing" == false ]]
}

load_recorded_release_metadata() {
  read_release_file "$CURRENT_RELEASE_FILE" CURRENT_IMAGE CURRENT_REVISION || return 1
  if [[ -e "$PREVIOUS_RELEASE_FILE" ]]; then
    read_release_file "$PREVIOUS_RELEASE_FILE" PREVIOUS_IMAGE PREVIOUS_REVISION || return 1
    HAS_PREVIOUS=true
  fi
}

release_images_match_labels() {
  image_has_revision_label "$CURRENT_IMAGE" "$CURRENT_REVISION" || return 1
  if [[ "$HAS_PREVIOUS" == true ]]; then
    image_has_revision_label "$PREVIOUS_IMAGE" "$PREVIOUS_REVISION" || return 1
    git_in_checkout merge-base --is-ancestor "$PREVIOUS_REVISION" "$CURRENT_REVISION" >/dev/null 2>&1 || return 1
  fi
}

stable_file_matches() {
  local source_file="$1"
  local installed_file="$2"
  local mode="$3"

  [[ -r "$source_file" && -f "$installed_file" && ! -L "$installed_file" ]] || return 1
  cmp -s "$source_file" "$installed_file" || return 1
  [[ "$(stat -c '%a' "$installed_file")" == "$mode" ]] || return 1
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    [[ "$(stat -c '%U:%G' "$installed_file")" == 'root:root' ]] || return 1
  fi
}

verify_stable_wrapper_parity() {
  local source_name installed_name mode
  local -a stable_files=(
    'lib/common.sh:common.sh:644'
    'status.sh:status:750'
    'logs.sh:logs:750'
    'backup.sh:backup:750'
    'deploy.sh:deploy:750'
    'rollback.sh:rollback:750'
    'smoke.sh:smoke:750'
    'dispatch.sh:dispatch:755'
    'preflight.sh:preflight:750'
  )

  for source_name in "${stable_files[@]}"; do
    IFS=: read -r source_name installed_name mode <<< "$source_name"
    stable_file_matches "$HOST_OPS_SOURCE_DIR/$source_name" "$LIBEXEC_DIR/$installed_name" "$mode" || return 1
  done
}

production_services_are_healthy() {
  local service container_id state

  for service in db redis app; do
    container_id="$(compose_for_release "$CURRENT_IMAGE" --profile prod ps -q "$service")" || return 1
    [[ -n "$container_id" && "$container_id" != *$'\n'* ]] || return 1
    state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id")" || return 1
    [[ "$state" == 'running healthy' ]] || return 1
  done
}

running_app_matches_recorded_release() {
  local container_id configured_image running_image_id recorded_image_id running_image_revision

  container_id="$(compose_for_release "$CURRENT_IMAGE" --profile prod ps -q app)" || return 1
  [[ -n "$container_id" && "$container_id" != *$'\n'* ]] || return 1
  configured_image="$(docker inspect --format '{{.Config.Image}}' "$container_id")" || return 1
  running_image_id="$(docker inspect --format '{{.Image}}' "$container_id")" || return 1
  recorded_image_id="$(docker image inspect --format '{{.Id}}' "$CURRENT_IMAGE")" || return 1
  running_image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$running_image_id")" || return 1

  [[ "$configured_image" == "$CURRENT_IMAGE" &&
    "$running_image_id" == "$recorded_image_id" &&
    "$running_image_revision" == "$CURRENT_REVISION" ]]
}

production_readiness_is_available() {
  local port

  port="$(read_env_integer APP_HOST_PORT 3001)" || return 1
  curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${port}/ready" >/dev/null
}

latest_backup_is_valid() {
  local latest_entry backup_file metadata_file checksum_file
  local -a metadata_lines=()
  local created_at release_state backup_revision backup_image

  latest_entry="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'postgres-*.dump' -printf '%T@:%p\n' | sort -nr | head -n 1)"
  [[ -n "$latest_entry" ]] || return 1
  backup_file="${latest_entry#*:}"
  metadata_file="${backup_file}.release"
  checksum_file="${backup_file}.sha256"
  [[ -s "$backup_file" && -f "$metadata_file" && -f "$checksum_file" ]] || return 1
  sha256sum --check --status "$checksum_file" || return 1

  mapfile -t metadata_lines < "$metadata_file"
  [[ "${#metadata_lines[@]}" -eq 4 ]] || return 1
  created_at="${metadata_lines[0]#created_at=}"
  release_state="${metadata_lines[1]#release_state=}"
  backup_revision="${metadata_lines[2]#revision=}"
  backup_image="${metadata_lines[3]#image=}"
  [[ "${metadata_lines[0]}" == "created_at=${created_at}" && "$created_at" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || return 1
  [[ "${metadata_lines[1]}" == "release_state=${release_state}" ]] || return 1
  [[ "$release_state" == recorded || "$release_state" == pre-adoption ]] || return 1
  [[ "${metadata_lines[2]}" == "revision=${backup_revision}" && "${metadata_lines[3]}" == "image=${backup_image}" ]] || return 1
  validate_release_metadata "$backup_image" "$backup_revision"
}

required_named_volumes_exist() {
  docker volume inspect "${PROJECT_NAME}_pgdata" >/dev/null 2>&1 &&
    docker volume inspect "${PROJECT_NAME}_redisdata" >/dev/null 2>&1
}

no_active_ghcr_configuration() {
  local file

  for file in "$HOST_CONFIG_FILE" "$ENV_FILE" "$CURRENT_RELEASE_FILE" "$PREVIOUS_RELEASE_FILE"; do
    [[ -e "$file" ]] || continue
    grep -Eiq "${RETIRED_REGISTRY_HOST//./\\.}|^[[:space:]]*(GHCR_IMAGE_REPOSITORY|IMAGE_REPOSITORY|CONTAINER_REGISTRY|REGISTRY_URL)=" "$file" && return 1
  done
  return 0
}

deploy_match_block_is_restricted() {
  awk -v expected_force_command="$LIBEXEC_DIR/dispatch" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }
    {
      line = $0
      sub(/[[:space:]]*#.*/, "", line)
      line = trim(line)
      gsub(/[[:space:]]+/, " ", line)
      if (line == "") next

      if (line ~ /^Match[[:space:]]/) {
        if (!found_deploy_match && line == "Match User deploy") {
          found_deploy_match = 1
          in_deploy_match = 1
        } else if (in_deploy_match) {
          in_deploy_match = 0
        }
        next
      }
      if (!in_deploy_match) next

      if (line == "AuthenticationMethods publickey") authentication_methods = 1
      if (line == "PasswordAuthentication no") password_authentication = 1
      if (line == "KbdInteractiveAuthentication no") kbd_interactive_authentication = 1
      if (line == "PermitTTY no") permit_tty = 1
      if (line == "DisableForwarding yes") disable_forwarding = 1
      if (line == "X11Forwarding no") x11_forwarding = 1
      if (line == "ForceCommand " expected_force_command) force_command = 1
    }
    END {
      exit !(found_deploy_match && authentication_methods && password_authentication &&
        kbd_interactive_authentication && permit_tty && disable_forwarding &&
        x11_forwarding && force_command)
    }
  ' "$DEPLOY_SSHD_CONFIG_FILE"
}

deploy_boundary_is_restricted() {
  deploy_match_block_is_restricted || return 1
  grep -Fqx -- "deploy ALL=(root) NOPASSWD: $LIBEXEC_DIR/deploy *" "$DEPLOY_SUDOERS_FILE" || return 1
  visudo -cf "$DEPLOY_SUDOERS_FILE" >/dev/null 2>&1 || return 1
  sshd -t >/dev/null 2>&1
}

while (($#)); do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if ! require_commands; then
  exit 2
fi
if ! load_host_config; then
  # load_host_config normally exits with its own actionable message.
  fail 'could not load host configuration'
  exit 1
fi

printf 'Read-only production host preflight. No deployment or configuration mutation will be attempted.\n'
check 'managed checkout is the configured public repository and has no local drift' checkout_is_safe
if load_recorded_release_metadata; then
  pass 'current release metadata is valid (and previous metadata when present)'
  export RELEASE_REVISION_FOR_COMPOSE="$CURRENT_REVISION"
  check 'managed checkout exactly matches the current recorded release' assert_checkout_at_revision "$CURRENT_REVISION"
  check 'current/previous release images carry matching OCI revision labels' release_images_match_labels
  check 'installed stable wrappers match the managed checkout and expected modes' verify_stable_wrapper_parity
  check 'production Compose services db, redis, and app are running and healthy' production_services_are_healthy
  check 'running app container image and OCI revision match current recorded release' running_app_matches_recorded_release
  check 'production loopback readiness endpoint responds successfully' production_readiness_is_available
else
  fail 'current and/or previous release metadata is invalid; expected deterministic local image tags and exact revisions'
fi
check 'latest PostgreSQL backup has a valid checksum and release metadata' latest_backup_is_valid
check 'required named Docker volumes exist (tcgplayer-automation_pgdata and tcgplayer-automation_redisdata)' required_named_volumes_exist
check 'host configuration and recorded release metadata contain no active GHCR configuration' no_active_ghcr_configuration
check 'deploy SSH Match block, forced-command, and sudo boundary are restricted and syntactically valid' deploy_boundary_is_restricted

if ((FAILURES > 0)); then
  printf 'Preflight failed with %d actionable issue(s). No host state was changed.\n' "$FAILURES" >&2
  exit 1
fi
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  printf 'Preflight passed without root ownership checks; rerun with sudo for the full host audit. No host state was changed.\n'
else
  printf 'Preflight passed. No host state was changed.\n'
fi
