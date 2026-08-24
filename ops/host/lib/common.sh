#!/usr/bin/env bash
# Shared helpers for root-owned TCGPlayer Automation host operations.

# These shared paths are consumed by the scripts that source this library.
# shellcheck disable=SC2034
readonly PROJECT_NAME="tcgplayer-automation"
readonly DEFAULT_INSTALL_DIR="/opt/tcgplayer-automation"
readonly DEFAULT_CONFIG_DIR="/etc/tcgplayer-automation"
readonly DEFAULT_STATE_DIR="/var/lib/tcgplayer-automation"
readonly DEFAULT_LIBEXEC_DIR="/usr/local/libexec/tcgplayer-automation"

INSTALL_DIR="${TCGPLAYER_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
CONFIG_DIR="${TCGPLAYER_CONFIG_DIR:-$DEFAULT_CONFIG_DIR}"
STATE_DIR="${TCGPLAYER_STATE_DIR:-$DEFAULT_STATE_DIR}"
LIBEXEC_DIR="${TCGPLAYER_LIBEXEC_DIR:-$DEFAULT_LIBEXEC_DIR}"
COMPOSE_FILE="${TCGPLAYER_COMPOSE_FILE:-$INSTALL_DIR/docker-compose.yml}"
ENV_FILE="${TCGPLAYER_ENV_FILE:-$CONFIG_DIR/app.env}"
HOST_CONFIG_FILE="${TCGPLAYER_HOST_CONFIG_FILE:-$CONFIG_DIR/host.conf}"
BACKUP_DIR="${TCGPLAYER_BACKUP_DIR:-$STATE_DIR/backups}"
CURRENT_RELEASE_FILE="${TCGPLAYER_CURRENT_RELEASE_FILE:-$STATE_DIR/current-release}"
PREVIOUS_RELEASE_FILE="${TCGPLAYER_PREVIOUS_RELEASE_FILE:-$STATE_DIR/previous-release}"

log() {
  printf '[tcgplayer-automation] %s\n' "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die 'this command must run as root'
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

load_host_config() {
  [[ -r "$HOST_CONFIG_FILE" ]] || die "missing host config: $HOST_CONFIG_FILE"
  # The installed file is root-owned and contains non-secret operational values.
  # shellcheck source=/dev/null
  source "$HOST_CONFIG_FILE"
  : "${GHCR_IMAGE_REPOSITORY:?GHCR_IMAGE_REPOSITORY is required in host.conf}"
  [[ "$GHCR_IMAGE_REPOSITORY" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+$ ]] ||
    die 'GHCR_IMAGE_REPOSITORY must be a lowercase ghcr.io owner/repository path'
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
  [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]{1,4}$ ]] ||
    die 'BACKUP_RETENTION_DAYS must be an integer'
}

validate_release_metadata() {
  local image_ref="${1:-}"
  local revision="${2:-}"
  local expected_repository="${GHCR_IMAGE_REPOSITORY:-}"

  [[ "$expected_repository" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+$ ]] || return 1
  [[ "$image_ref" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$image_ref" == "$expected_repository"@sha256:* ]] || return 1
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || return 1
}

validate_service_name() {
  case "${1:-}" in
    app | db | redis) return 0 ;;
    *) return 1 ;;
  esac
}

read_release_file() {
  local release_file="$1"
  local -n image_output="$2"
  local -n revision_output="$3"
  local -a release_lines=()

  [[ -r "$release_file" ]] || return 1
  mapfile -t release_lines < "$release_file"
  [[ "${#release_lines[@]}" -eq 2 ]] || return 1
  image_output="${release_lines[0]}"
  revision_output="${release_lines[1]}"
  validate_release_metadata "$image_output" "$revision_output"
}

write_release_file() {
  local release_file="$1"
  local image_ref="$2"
  local revision="$3"
  local temp_file

  validate_release_metadata "$image_ref" "$revision" || die 'invalid release metadata'
  temp_file="$(mktemp "$STATE_DIR/.release.XXXXXX")"
  printf '%s\n%s\n' "$image_ref" "$revision" > "$temp_file"
  chmod 0600 "$temp_file"
  mv -f "$temp_file" "$release_file"
}

compose_for_release() {
  local image_ref="$1"
  shift
  validate_release_metadata "$image_ref" "${RELEASE_REVISION_FOR_COMPOSE:-0000000000000000000000000000000000000000}" ||
    die 'invalid image reference'
  [[ -r "$ENV_FILE" ]] || die "missing application environment: $ENV_FILE"
  [[ -r "$COMPOSE_FILE" ]] || die "missing Compose file: $COMPOSE_FILE"

  APP_IMAGE="$image_ref" \
    APP_ENV_FILE="$ENV_FILE" \
    COMPOSE_PROFILES=prod \
    docker compose \
      --project-name "$PROJECT_NAME" \
      --env-file "$ENV_FILE" \
      --file "$COMPOSE_FILE" \
      "$@"
}

read_env_integer() {
  local key="$1"
  local fallback="$2"
  local value

  value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE")"
  value="${value:-$fallback}"
  [[ "$value" =~ ^[0-9]{1,5}$ ]] || die "$key must be a numeric port"
  (( value >= 1 && value <= 65535 )) || die "$key must be between 1 and 65535"
  printf '%s\n' "$value"
}

smoke_release() {
  local port
  port="$(read_env_integer APP_HOST_PORT 3000)"

  for _ in {1..30}; do
    if curl --fail --silent --show-error --max-time 5 \
      "http://127.0.0.1:${port}/ready" >/dev/null; then
      log "readiness check passed on loopback port $port"
      return 0
    fi
    sleep 2
  done

  log "readiness check failed on loopback port $port"
  return 1
}

acquire_deploy_lock() {
  require_command flock
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/deploy.lock"
  flock -n 9 || die 'another deployment or rollback is already running'
}
