#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
if ! declare -F local_image_for_revision >/dev/null; then
  source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"
fi

restore_rollback_current_app() {
  local current_image="$1"
  local current_revision="$2"

  log 'rollback image failed readiness; restoring the current app image'
  if ! prepare_checkout_for_recorded_release "$current_revision"; then
    log 'WARNING: could not restore the current revision checkout'
    return 1
  fi
  ensure_local_image "$current_image" "$current_revision"
  export RELEASE_REVISION_FOR_COMPOSE="$current_revision"
  compose_for_release "$current_image" --profile prod up -d --no-build db redis --wait --wait-timeout 120 || return 1
  compose_for_release "$current_image" --profile prod up -d --no-build app --wait --wait-timeout 120 || return 1
  smoke_release
}

rollback_release() {
  local current_image current_revision previous_image previous_revision
  local rollback_ready=true

  read_release_file "$CURRENT_RELEASE_FILE" current_image current_revision ||
    die 'no valid current release is recorded'
  read_release_file "$PREVIOUS_RELEASE_FILE" previous_image previous_revision ||
    die 'no valid previous release is recorded'

  # Back up with the current release's checked-in Compose file before changing
  # the checkout to the previous release's Compose definition.
  prepare_checkout_for_recorded_release "$current_revision" ||
    die 'could not safely select the current release checkout for backup'
  ensure_local_image "$current_image" "$current_revision"
  export RELEASE_REVISION_FOR_COMPOSE="$current_revision"
  compose_for_release "$current_image" --profile prod up -d --no-build db redis --wait --wait-timeout 120
  log 'taking a pre-rollback database backup'
  backup_recorded_release

  prepare_checkout_for_recorded_release "$previous_revision" ||
    die 'could not safely select the previous release checkout'
  ensure_local_image "$previous_image" "$previous_revision"
  export RELEASE_REVISION_FOR_COMPOSE="$previous_revision"

  # Database migrations are intentionally not reversed. Releases must keep one-step
  # schema compatibility so the previous app can run against the migrated schema.
  compose_for_release "$previous_image" --profile prod up -d --no-build db redis --wait --wait-timeout 120
  if ! compose_for_release "$previous_image" --profile prod up -d --no-build app --wait --wait-timeout 120; then
    rollback_ready=false
  elif ! smoke_release; then
    rollback_ready=false
  fi

  if [[ "$rollback_ready" != true ]]; then
    restore_rollback_current_app "$current_image" "$current_revision" ||
      log 'WARNING: current app image also failed restoration readiness'
    die 'rollback failed; release state was not changed'
  fi

  write_release_file "$CURRENT_RELEASE_FILE" "$previous_image" "$previous_revision"
  write_release_file "$PREVIOUS_RELEASE_FILE" "$current_image" "$current_revision"
  log "rollback complete: $previous_revision"
}

main() {
  (($# == 0)) || die 'usage: rollback'
  require_root
  require_command curl
  require_command docker
  require_command git
  load_host_config
  acquire_deploy_lock
  rollback_release
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
