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

# The prior deploy path wrote this exact repository-derived GHCR digest format.
# It is intentionally only accepted during the one-time local-image adoption;
# ordinary release state accepts deterministic local tags only.
legacy_ghcr_image_repository() {
  local repository_path

  validate_repository_url "${REPOSITORY_URL:-}" || return 1
  repository_path="${REPOSITORY_URL#https://github.com/}"
  repository_path="${repository_path%.git}"
  printf 'ghcr.io/%s\n' "$(printf '%s' "$repository_path" | tr '[:upper:]' '[:lower:]')"
}

validate_legacy_release_metadata() {
  local image_ref="${1:-}"
  local revision="${2:-}"
  local expected_repository

  expected_repository="$(legacy_ghcr_image_repository)" || return 1
  validate_revision "$revision" || return 1
  [[ "$image_ref" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$image_ref" == "$expected_repository"@sha256:* ]]
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

read_release_file_lines() {
  local release_file="$1"
  local -n image_output="$2"
  local -n revision_output="$3"
  local -a release_lines=()

  # Release state is root-owned regular data, never a symlink. This also keeps
  # adoption from treating arbitrary filesystem objects as trusted metadata.
  [[ -f "$release_file" && ! -L "$release_file" && -r "$release_file" ]] || return 1
  mapfile -t release_lines < "$release_file"
  [[ "${#release_lines[@]}" -eq 2 ]] || return 1
  image_output="${release_lines[0]}"
  revision_output="${release_lines[1]}"
}

read_release_file() {
  local release_file="$1"
  local -n image_output="$2"
  local -n revision_output="$3"
  local parsed_image parsed_revision

  read_release_file_lines "$release_file" parsed_image parsed_revision || return 1
  validate_release_metadata "$parsed_image" "$parsed_revision" || return 1
  image_output="$parsed_image"
  revision_output="$parsed_revision"
}

read_legacy_release_file() {
  local release_file="$1"
  local -n image_output="$2"
  local -n revision_output="$3"
  local parsed_image parsed_revision

  read_release_file_lines "$release_file" parsed_image parsed_revision || return 1
  validate_legacy_release_metadata "$parsed_image" "$parsed_revision" || return 1
  image_output="$parsed_image"
  revision_output="$parsed_revision"
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
# before checking out, so stale/invalid requests cannot replace the working
# tree. Fetching the tracked public branch is safe before the final checkout.
prepare_deploy_target_revision() {
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
}

prepare_checkout_for_deploy() {
  local revision="$1"

  prepare_deploy_target_revision "$revision" || return 1
  checkout_exact_revision "$revision"
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

# Read enough complete, immutable release state to recover the checkout after
# the stable wrapper has selected a target but before versioned release logic
# can arm its own finalizer. Legacy records are accepted only in their exact
# project-owned form; this function never adopts, retags, or writes state.
load_recorded_checkout_restore_state() {
  local target_revision="$1"
  local -n has_current_output="$2"
  local -n current_revision_output="$3"
  local recorded_current_image recorded_current_revision
  local recorded_previous_image='' recorded_previous_revision=''

  has_current_output=false
  current_revision_output=''
  validate_revision "$target_revision" || return 1
  if [[ ! -e "$CURRENT_RELEASE_FILE" ]]; then
    [[ ! -e "$PREVIOUS_RELEASE_FILE" ]] || {
      log 'previous release state exists without current release state'
      return 1
    }
    return 0
  fi

  if read_release_file "$CURRENT_RELEASE_FILE" recorded_current_image recorded_current_revision; then
    if [[ -e "$PREVIOUS_RELEASE_FILE" ]]; then
      read_release_file "$PREVIOUS_RELEASE_FILE" recorded_previous_image recorded_previous_revision || {
        log 'previous release state is invalid or not fully adopted'
        return 1
      }
    fi
  elif read_legacy_release_file "$CURRENT_RELEASE_FILE" recorded_current_image recorded_current_revision; then
    image_has_revision_label "$recorded_current_image" "$recorded_current_revision" || {
      log 'legacy current image is missing locally or has an unexpected revision label'
      return 1
    }
    if [[ -e "$PREVIOUS_RELEASE_FILE" ]]; then
      read_legacy_release_file "$PREVIOUS_RELEASE_FILE" recorded_previous_image recorded_previous_revision || {
        log 'previous release state is not exact legacy GHCR metadata'
        return 1
      }
      image_has_revision_label "$recorded_previous_image" "$recorded_previous_revision" || {
        log 'legacy previous image is missing locally or has an unexpected revision label'
        return 1
      }
    fi
  else
    log 'current release state is neither valid local metadata nor exact legacy GHCR metadata'
    return 1
  fi

  git_in_checkout cat-file -e "${recorded_current_revision}^{commit}" 2>/dev/null || {
    log 'recorded current release revision is not available locally'
    return 1
  }
  git_in_checkout merge-base --is-ancestor "$recorded_current_revision" "$target_revision" || {
    log 'recorded current release revision is not reachable from the deployment revision'
    return 1
  }
  if [[ -n "$recorded_previous_revision" ]]; then
    git_in_checkout merge-base --is-ancestor "$recorded_previous_revision" "$recorded_current_revision" || {
      log 'recorded previous release revision is not an ancestor of current release'
      return 1
    }
  fi

  has_current_output=true
  current_revision_output="$recorded_current_revision"
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

image_has_revision_label() {
  local image_ref="$1"
  local revision="$2"
  local image_revision

  validate_revision "$revision" || return 1
  image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref" 2>/dev/null)" || return 1
  [[ "$image_revision" == "$revision" ]]
}

archive_legacy_release_files() {
  local archive_dir

  archive_dir="$(mktemp -d "$STATE_DIR/legacy-release-adoption.XXXXXX")" || return 1
  chmod 0700 "$archive_dir" || return 1
  cp --no-dereference --preserve=mode,timestamps -- "$CURRENT_RELEASE_FILE" "$archive_dir/current-release" || return 1
  if [[ -e "$PREVIOUS_RELEASE_FILE" ]]; then
    cp --no-dereference --preserve=mode,timestamps -- "$PREVIOUS_RELEASE_FILE" "$archive_dir/previous-release" || return 1
  fi
  printf '%s\n' "$archive_dir"
}

# Convert only the old project-owned GHCR digest records. All validation,
# including local image labels and revision ancestry, happens before files are
# archived or tags/state are changed. This path never pulls from a registry.
adopt_legacy_release_state() {
  local target_revision="$1"
  local legacy_current_image legacy_current_revision
  local legacy_previous_image='' legacy_previous_revision=''
  local local_current_image local_previous_image archive_dir
  local has_previous=false

  validate_revision "$target_revision" || return 1
  read_legacy_release_file "$CURRENT_RELEASE_FILE" legacy_current_image legacy_current_revision || {
    log 'current release state is neither valid local metadata nor exact legacy GHCR metadata'
    return 1
  }
  if [[ -e "$PREVIOUS_RELEASE_FILE" ]]; then
    read_legacy_release_file "$PREVIOUS_RELEASE_FILE" legacy_previous_image legacy_previous_revision || {
      log 'previous release state is not exact legacy GHCR metadata'
      return 1
    }
    has_previous=true
  fi

  git_in_checkout merge-base --is-ancestor "$legacy_current_revision" "$target_revision" || {
    log 'legacy current revision is not an ancestor of the deployment revision'
    return 1
  }
  if [[ "$has_previous" == true ]]; then
    git_in_checkout merge-base --is-ancestor "$legacy_previous_revision" "$legacy_current_revision" || {
      log 'legacy previous revision is not an ancestor of legacy current revision'
      return 1
    }
  fi
  image_has_revision_label "$legacy_current_image" "$legacy_current_revision" || {
    log 'legacy current image is missing locally or has an unexpected revision label'
    return 1
  }
  if [[ "$has_previous" == true ]]; then
    image_has_revision_label "$legacy_previous_image" "$legacy_previous_revision" || {
      log 'legacy previous image is missing locally or has an unexpected revision label'
      return 1
    }
  fi

  local_current_image="$(local_image_for_revision "$legacy_current_revision")" || return 1
  if [[ "$has_previous" == true ]]; then
    local_previous_image="$(local_image_for_revision "$legacy_previous_revision")" || return 1
  fi
  archive_dir="$(archive_legacy_release_files)" || {
    log 'could not safely archive legacy release state; refusing adoption'
    return 1
  }

  docker tag "$legacy_current_image" "$local_current_image" || return 1
  if [[ "$has_previous" == true ]]; then
    docker tag "$legacy_previous_image" "$local_previous_image" || return 1
    write_release_file "$PREVIOUS_RELEASE_FILE" "$local_previous_image" "$legacy_previous_revision"
  fi
  write_release_file "$CURRENT_RELEASE_FILE" "$local_current_image" "$legacy_current_revision"
  log "adopted legacy GHCR release state; originals archived in $archive_dir"
}

load_deployment_release_state() {
  local target_revision="$1"
  local -n has_current_output="$2"
  local -n current_image_output="$3"
  local -n current_revision_output="$4"
  local previous_image previous_revision

  has_current_output=false
  current_image_output=''
  current_revision_output=''
  [[ -e "$CURRENT_RELEASE_FILE" ]] || return 0

  if ! read_release_file "$CURRENT_RELEASE_FILE" current_image_output current_revision_output; then
    adopt_legacy_release_state "$target_revision" || return 1
    read_release_file "$CURRENT_RELEASE_FILE" current_image_output current_revision_output || return 1
  fi
  has_current_output=true

  # A partially converted or otherwise mixed state is not safe to roll back.
  if [[ -e "$PREVIOUS_RELEASE_FILE" ]]; then
    read_release_file "$PREVIOUS_RELEASE_FILE" previous_image previous_revision || {
      log 'previous release state is invalid or not fully adopted'
      return 1
    }
  fi
}

build_local_image() {
  local image_ref="$1"
  local revision="$2"
  local image_revision

  validate_release_metadata "$image_ref" "$revision" || {
    log 'invalid local release metadata'
    return 1
  }
  assert_checkout_at_revision "$revision" || {
    log 'managed checkout changed before local build'
    return 1
  }
  log "building local production image for revision $revision"
  docker build \
    --target production \
    --build-arg "VCS_REF=$revision" \
    --tag "$image_ref" \
    "$INSTALL_DIR" || return 1
  image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")" || return 1
  [[ "$image_revision" == "$revision" ]] || {
    log 'locally built image revision label does not match the requested revision'
    return 1
  }
}

ensure_local_image() {
  local image_ref="$1"
  local revision="$2"
  local image_revision=''

  validate_release_metadata "$image_ref" "$revision" || {
    log 'invalid local release metadata'
    return 1
  }
  image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref" 2>/dev/null || true)"
  if [[ "$image_revision" != "$revision" ]]; then
    build_local_image "$image_ref" "$revision" || return 1
  fi
}

compose_for_release() {
  local image_ref="$1"
  shift

  validate_release_metadata "$image_ref" "${RELEASE_REVISION_FOR_COMPOSE:-}" || {
    log 'invalid local image reference'
    return 1
  }
  [[ -r "$ENV_FILE" ]] || {
    log "missing application environment: $ENV_FILE"
    return 1
  }
  [[ -r "$COMPOSE_FILE" ]] || {
    log "missing versioned Compose file: $COMPOSE_FILE"
    return 1
  }

  APP_IMAGE="$image_ref" \
    APP_ENV_FILE="$ENV_FILE" \
    COMPOSE_PROFILES=prod \
    docker compose \
      --project-name "$PROJECT_NAME" \
      --env-file "$ENV_FILE" \
      --file "$COMPOSE_FILE" \
      "$@"
}

# This implementation deliberately lives in the currently loaded shared
# library, rather than a versioned backup.sh process. Deployments temporarily
# select a recorded release only to use its reviewed Compose file; invoking its
# old helper scripts would also revive obsolete host-config contracts.
backup_for_release() {
  local image_ref="${1:-}"
  local revision="${2:-}"
  local release_state="${3:-recorded}"
  local timestamp backup_file metadata_file temp_file

  [[ "$#" -eq 2 || "$#" -eq 3 ]] || {
    log 'usage: backup_for_release LOCAL_IMAGE REVISION [recorded|pre-adoption]'
    return 1
  }
  validate_release_metadata "$image_ref" "$revision" || {
    log 'invalid local release metadata for backup'
    return 1
  }
  case "$release_state" in
    recorded | pre-adoption) ;;
    *)
      log 'invalid backup release state'
      return 1
      ;;
  esac

  # The caller has selected the Compose definition reviewed with this release.
  # Keep the revision/image pairing strict while continuing to use the external
  # app environment, project name, and persistent volumes through compose_for_release.
  assert_checkout_at_revision "$revision" || {
    log 'managed checkout does not match backup release metadata'
    return 1
  }
  export RELEASE_REVISION_FOR_COMPOSE="$revision"

  mkdir -p "$BACKUP_DIR" || return 1
  chmod 0700 "$BACKUP_DIR" || return 1
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)" || return 1
  backup_file="$BACKUP_DIR/postgres-${timestamp}-${revision:0:12}.dump"
  metadata_file="$backup_file.release"
  temp_file="$(mktemp "$BACKUP_DIR/.postgres.XXXXXX")" || return 1

  log 'creating a PostgreSQL custom-format backup'
  if ! compose_for_release "$image_ref" --profile prod exec -T db sh -ec \
    'exec pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
    > "$temp_file"; then
    rm -f "$temp_file"
    return 1
  fi
  if [[ ! -s "$temp_file" ]]; then
    rm -f "$temp_file"
    log 'database backup is empty'
    return 1
  fi
  chmod 0600 "$temp_file" || {
    rm -f "$temp_file"
    return 1
  }
  mv "$temp_file" "$backup_file" || {
    rm -f "$temp_file"
    return 1
  }
  printf 'created_at=%s\nrelease_state=%s\nrevision=%s\nimage=%s\n' \
    "$timestamp" "$release_state" "$revision" "$image_ref" > "$metadata_file" || return 1
  chmod 0600 "$metadata_file" || return 1
  sha256sum "$backup_file" > "$backup_file.sha256" || return 1
  chmod 0600 "$backup_file.sha256" || return 1

  find "$BACKUP_DIR" -maxdepth 1 -type f -mtime "+$BACKUP_RETENTION_DAYS" \
    \( -name 'postgres-*.dump' -o -name 'postgres-*.dump.release' -o -name 'postgres-*.dump.sha256' \) \
    -delete || return 1
  log "backup complete: $backup_file"
}

backup_recorded_release() {
  local image_ref revision

  case "$#" in
    0)
      read_release_file "$CURRENT_RELEASE_FILE" image_ref revision || {
        log 'no valid current release is recorded'
        return 1
      }
      ;;
    2)
      image_ref="$1"
      revision="$2"
      ;;
    *)
      log 'usage: backup_recorded_release [LOCAL_IMAGE REVISION]'
      return 1
      ;;
  esac

  backup_for_release "$image_ref" "$revision" recorded
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
