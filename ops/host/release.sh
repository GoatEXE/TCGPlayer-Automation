#!/usr/bin/env bash
# Versioned release implementation. The stable installed deploy wrapper checks
# out the approved revision before invoking this file from that checkout.
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
if ! declare -F local_image_for_revision >/dev/null; then
  source "$SCRIPT_DIR/lib/common.sh"
fi

restore_current_app() {
  local current_image="$1"
  local current_revision="$2"

  log "new release failed readiness; restoring current app revision $current_revision"
  if ! prepare_checkout_for_recorded_release "$current_revision"; then
    log 'WARNING: could not restore the current revision checkout'
    return 1
  fi
  ensure_local_image "$current_image" "$current_revision"
  export RELEASE_REVISION_FOR_COMPOSE="$current_revision"
  compose_for_release "$current_image" --profile prod up -d --no-build app --wait --wait-timeout 120 || return 1
  smoke_release
}

release_deploy() {
  local new_revision="$1"
  local new_image
  local current_image=''
  local current_revision=''
  local has_current=false
  local deployment_ready=true

  validate_revision "$new_revision" || die 'requested revision must be exactly 40 lowercase hexadecimal characters'
  assert_checkout_at_revision "$new_revision" || die 'managed checkout is not the requested release revision'
  validate_deployment_progression "$new_revision" || die 'requested deployment is out of order'
  new_image="$(local_image_for_revision "$new_revision")"
  export RELEASE_REVISION_FOR_COMPOSE="$new_revision"

  if [[ -e "$CURRENT_RELEASE_FILE" ]]; then
    read_release_file "$CURRENT_RELEASE_FILE" current_image current_revision ||
      die 'current release state is invalid'
    has_current=true
  fi

  build_local_image "$new_image" "$new_revision"

  log 'starting and waiting for production data services'
  compose_for_release "$new_image" --profile prod up -d --no-build db redis --wait --wait-timeout 120

  log 'taking a pre-deploy database backup'
  if [[ "$has_current" == true ]]; then
    backup_for_release
  else
    # The target metadata lets backup use this revision's Compose file before
    # release state exists; it records the dump as pre-adoption.
    backup_for_release "$new_image" "$new_revision"
  fi

  log 'running the one-shot migration job'
  compose_for_release "$new_image" --profile ops run --rm migrate

  log 'replacing the application container'
  if ! compose_for_release "$new_image" --profile prod up -d --no-build app --wait --wait-timeout 120; then
    deployment_ready=false
  elif ! smoke_release; then
    deployment_ready=false
  fi

  if [[ "$deployment_ready" != true ]]; then
    if [[ "$has_current" == true ]]; then
      restore_current_app "$current_image" "$current_revision" ||
        log 'WARNING: current app release also failed restoration readiness'
    fi
    die 'deployment failed; release state was not advanced'
  fi

  if [[ "$has_current" == true && "$current_image" != "$new_image" ]]; then
    write_release_file "$PREVIOUS_RELEASE_FILE" "$current_image" "$current_revision"
  fi
  write_release_file "$CURRENT_RELEASE_FILE" "$new_image" "$new_revision"
  log "deployment complete: $new_revision"
}

main() {
  (($# == 2 && "$1" == "deploy")) || die 'usage: release deploy REVISION'
  [[ "${TCGPLAYER_RELEASE_DISPATCHED:-}" == 1 ]] ||
    die 'release implementation must be invoked through the installed deploy wrapper'
  require_root
  require_command curl
  require_command docker
  require_command git
  load_host_config
  release_deploy "$2"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
