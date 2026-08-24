#!/usr/bin/env bash
# Shared helpers for root-owned TCGPlayer Automation host operations.

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
# Compose deliberately stays in the managed repository checkout. A release
# therefore uses the Compose file that was reviewed with its exact revision.
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
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

validate_repository_url() {
  [[ "${1:-}" =~ ^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\.git$ ]]
}

validate_revision() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]
}

load_host_config() {
  [[ -r "$HOST_CONFIG_FILE" ]] || die "missing host config: $HOST_CONFIG_FILE"
  # The installed file is root-owned and contains non-secret operational values.
  # shellcheck source=/dev/null
  source "$HOST_CONFIG_FILE"
  : "${REPOSITORY_URL:?REPOSITORY_URL is required in host.conf}"
  validate_repository_url "$REPOSITORY_URL" ||
    die 'REPOSITORY_URL must be a public https://github.com/owner/repository.git URL'
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
  [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]{1,4}$ ]] ||
    die 'BACKUP_RETENTION_DAYS must be an integer'
}

local_image_for_revision() {
  local revision="${1:-}"
  validate_revision "$revision" || return 1
  printf '%s:revision-%s\n' "$PROJECT_NAME" "$revision"
}

validate_release_metadata() {
  local image_ref="${1:-}"
  local revision="${2:-}"
  local expected_image

  expected_image="$(local_image_for_revision "$revision")" || return 1
  [[ "$image_ref" == "$expected_image" ]]
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
  mkdir -p "$STATE_DIR"
  temp_file="$(mktemp "$STATE_DIR/.release.XXXXXX")"
  printf '%s\n%s\n' "$image_ref" "$revision" > "$temp_file"
  chmod 0600 "$temp_file"
  mv -f "$temp_file" "$release_file"
}

git_in_checkout() {
  git -C "$INSTALL_DIR" -c core.hooksPath=/dev/null "$@"
}

checkout_is_safe() {
  local top_level origin_url status

  [[ -d "$INSTALL_DIR/.git" ]] || {
    log "missing managed repository checkout: $INSTALL_DIR"
    return 1
  }
  top_level="$(git_in_checkout rev-parse --show-toplevel 2>/dev/null)" || return 1
  [[ "$(CDPATH='' cd -- "$top_level" && pwd -P)" == "$(CDPATH='' cd -- "$INSTALL_DIR" && pwd -P)" ]] || {
    log 'managed repository checkout has an unexpected top-level directory'
    return 1
  }
  origin_url="$(git_in_checkout remote get-url origin 2>/dev/null)" || return 1
  [[ "$origin_url" == "$REPOSITORY_URL" ]] || {
    log 'managed repository origin does not match REPOSITORY_URL'
    return 1
  }
  status="$(git_in_checkout status --porcelain --untracked-files=all)" || return 1
  [[ -z "$status" ]] || {
    log 'managed repository checkout has local drift; refusing to replace it'
    return 1
  }
}

remote_master_revision() {
  local remote_ref

  remote_ref="$(git_in_checkout ls-remote --exit-code origin refs/heads/master 2>/dev/null)" || return 1
  [[ "$remote_ref" =~ ^([0-9a-f]{40})[[:space:]]refs/heads/master$ ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

fetch_origin_master() {
  git_in_checkout fetch --no-tags --prune origin \
    +refs/heads/master:refs/remotes/origin/master >/dev/null
}

checkout_exact_revision() {
  local revision="$1"

  validate_revision "$revision" || return 1
  git_in_checkout checkout --detach "$revision" >/dev/null
  [[ "$(git_in_checkout rev-parse HEAD)" == "$revision" ]]
}

# This is used only for the dispatcher path. It performs all rejecting checks
# before fetching or checking out, so stale/invalid requests cannot mutate the
# working tree or its origin/master tracking ref.
prepare_checkout_for_deploy() {
  local revision="$1"
  local remote_revision fetched_revision

  validate_revision "$revision" || {
    log 'requested revision must be exactly 40 lowercase hexadecimal characters'
    return 1
  }
  checkout_is_safe || return 1
  remote_revision="$(remote_master_revision)" || {
    log 'could not read origin/master from the configured public repository'
    return 1
  }
  [[ "$remote_revision" == "$revision" ]] || {
    log 'requested revision is not the current origin/master revision'
    return 1
  }
  fetch_origin_master || return 1
  fetched_revision="$(git_in_checkout rev-parse refs/remotes/origin/master)" || return 1
  [[ "$fetched_revision" == "$revision" ]] || {
    log 'fetched origin/master does not match the requested revision'
    return 1
  }
  checkout_exact_revision "$revision" || return 1
}

# Recorded releases may be older than the current master tip, so rollback uses
# ancestry rather than the deploy endpoint's exact-tip rule. State is root-owned
# and only validated deterministic local tags/revisions are accepted.
prepare_checkout_for_recorded_release() {
  local revision="$1"
  local remote_revision

  validate_revision "$revision" || return 1
  checkout_is_safe || return 1
  remote_revision="$(remote_master_revision)" || {
    log 'could not read origin/master from the configured public repository'
    return 1
  }
  fetch_origin_master || return 1
  git_in_checkout cat-file -e "${revision}^{commit}" 2>/dev/null || {
    log 'recorded release revision is not available from origin/master'
    return 1
  }
  git_in_checkout merge-base --is-ancestor "$revision" "$remote_revision" || {
    log 'recorded release revision is not reachable from origin/master'
    return 1
  }
  checkout_exact_revision "$revision"
}

assert_checkout_at_revision() {
  local revision="$1"

  validate_revision "$revision" || return 1
  [[ "$(git_in_checkout rev-parse HEAD 2>/dev/null)" == "$revision" ]] || {
    log 'managed repository checkout does not match requested release revision'
    return 1
  }
  checkout_is_safe
}

validate_deployment_progression() {
  local new_revision="$1"
  local current_image current_revision

  validate_revision "$new_revision" || return 1
  if [[ ! -e "$CURRENT_RELEASE_FILE" ]]; then
    return 0
  fi
  read_release_file "$CURRENT_RELEASE_FILE" current_image current_revision || {
    log 'current release state is invalid'
    return 1
  }
  git_in_checkout merge-base --is-ancestor "$current_revision" "$new_revision" || {
    log 'requested deployment would move release history out of order'
    return 1
  }
}

build_local_image() {
  local image_ref="$1"
  local revision="$2"
  local image_revision

  validate_release_metadata "$image_ref" "$revision" || die 'invalid local release metadata'
  assert_checkout_at_revision "$revision" || die 'managed checkout changed before local build'
  log "building local production image for revision $revision"
  docker build \
    --target production \
    --build-arg "VCS_REF=$revision" \
    --tag "$image_ref" \
    "$INSTALL_DIR"
  image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")"
  [[ "$image_revision" == "$revision" ]] ||
    die 'locally built image revision label does not match the requested revision'
}

ensure_local_image() {
  local image_ref="$1"
  local revision="$2"
  local image_revision=''

  validate_release_metadata "$image_ref" "$revision" || die 'invalid local release metadata'
  image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref" 2>/dev/null || true)"
  if [[ "$image_revision" != "$revision" ]]; then
    build_local_image "$image_ref" "$revision"
  fi
}

compose_for_release() {
  local image_ref="$1"
  shift

  validate_release_metadata "$image_ref" "${RELEASE_REVISION_FOR_COMPOSE:-}" ||
    die 'invalid local image reference'
  [[ -r "$ENV_FILE" ]] || die "missing application environment: $ENV_FILE"
  [[ -r "$COMPOSE_FILE" ]] || die "missing versioned Compose file: $COMPOSE_FILE"

  APP_IMAGE="$image_ref" \
    APP_ENV_FILE="$ENV_FILE" \
    COMPOSE_PROFILES=prod \
    docker compose \
      --project-name "$PROJECT_NAME" \
      --env-file "$ENV_FILE" \
      --file "$COMPOSE_FILE" \
      "$@"
}

backup_for_release() {
  local script="$INSTALL_DIR/ops/host/backup.sh"

  [[ -r "$script" ]] || die "missing versioned backup script: $script"
  bash "$script" "$@"
}

backup_recorded_release() {
  backup_for_release "$@"
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
  port="$(read_env_integer APP_HOST_PORT 3001)"

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
