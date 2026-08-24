#!/usr/bin/env bash
# Versioned release implementation. The stable installed deploy wrapper checks
# out the approved revision before invoking this file from that checkout.
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
if ! declare -F local_image_for_revision >/dev/null; then
  source "$SCRIPT_DIR/lib/common.sh"
fi

restore_recorded_checkout() {
  local current_revision="$1"

  if prepare_checkout_for_recorded_release "$current_revision"; then
    return 0
  fi

  # The recorded revision was validated as an ancestor before deployment work
  # began. If the remote check is temporarily unavailable, restore the already
  # verified local checkout rather than leave current release metadata paired
  # with the failed target's Compose file.
  log 'WARNING: remote verification failed during restoration; using the verified local recorded revision'
  checkout_exact_revision "$current_revision" || return 1
  assert_checkout_at_revision "$current_revision"
}

restore_current_app() {
  local current_image="$1"
  local current_revision="$2"

  log "deployment did not complete; restoring recorded current revision $current_revision"
  restore_recorded_checkout "$current_revision" || {
    log 'WARNING: could not restore the recorded current revision checkout'
    return 1
  }
  ensure_local_image "$current_image" "$current_revision" || return 1
  export RELEASE_REVISION_FOR_COMPOSE="$current_revision"
  compose_for_release "$current_image" --profile prod up -d --no-build db redis --wait --wait-timeout 120 || return 1
  compose_for_release "$current_image" --profile prod up -d --no-build app --wait --wait-timeout 120 || return 1
  smoke_release
}

release_deploy_finalizer() {
  local exit_status="$1"
  local finalizer_armed="$2"
  local has_current="$3"
  local current_restore_safe="$4"
  local current_image="$5"
  local current_revision="$6"

  trap - EXIT
  if [[ "$exit_status" -ne 0 && "$finalizer_armed" == true && "$has_current" == true && "$current_restore_safe" == true ]]; then
    restore_current_app "$current_image" "$current_revision" ||
      log 'WARNING: recorded current app failed restoration readiness'
  fi
  exit "$exit_status"
}

release_deploy() (
  local new_revision="$1"
  local new_image
  local current_image=''
  local current_revision=''
  local has_current=false
  local deployment_ready=true
  local finalizer_armed=false
  local current_restore_safe=false

  # This per-deploy subshell ensures every nonzero exit after the target
  # checkout has been selected restores the verified recorded checkout/app.
  # It covers errors before the former readiness-only recovery branch.
  trap 'release_deploy_finalizer "$?" "$finalizer_armed" "$has_current" "$current_restore_safe" "$current_image" "$current_revision"' EXIT

  validate_revision "$new_revision" || die 'requested revision must be exactly 40 lowercase hexadecimal characters'
  assert_checkout_at_revision "$new_revision" || die 'managed checkout is not the requested release revision'
  new_image="$(local_image_for_revision "$new_revision")" || die 'could not derive local release image metadata'

  # Valid legacy GHCR state is adopted before this deploy. Invalid, mixed, or
  # missing-local-image state is rejected without touching release files.
  load_deployment_release_state "$new_revision" has_current current_image current_revision ||
    die 'current release state is invalid or could not be safely adopted'
  finalizer_armed=true
  validate_deployment_progression "$new_revision" || die 'requested deployment is out of order'
  current_restore_safe=true
  export RELEASE_REVISION_FOR_COMPOSE="$new_revision"

  build_local_image "$new_image" "$new_revision" || die 'local production image build failed'

  log 'starting and waiting for production data services'
  compose_for_release "$new_image" --profile prod up -d --no-build db redis --wait --wait-timeout 120 ||
    die 'production data services did not become ready'

  log 'taking a pre-deploy database backup'
  if [[ "$has_current" == true ]]; then
    # Backup/status/logs must use the Compose file paired with recorded state,
    # never old metadata plus the target revision's Compose definition.
    restore_recorded_checkout "$current_revision" ||
      die 'could not select the recorded release checkout for backup'
    backup_for_release || die 'pre-deploy database backup failed'
    checkout_exact_revision "$new_revision" ||
      die 'could not return to the target checkout after backup'
    assert_checkout_at_revision "$new_revision" ||
      die 'managed checkout changed after backup'
  else
    # The target metadata lets backup address Compose before release state
    # exists; it records the dump as pre-adoption.
    backup_for_release "$new_image" "$new_revision" || die 'pre-deploy database backup failed'
  fi

  log 'running the one-shot migration job'
  compose_for_release "$new_image" --profile ops run --rm migrate ||
    die 'one-shot migration job failed'

  log 'replacing the application container'
  if ! compose_for_release "$new_image" --profile prod up -d --no-build app --wait --wait-timeout 120; then
    deployment_ready=false
  elif ! smoke_release; then
    deployment_ready=false
  fi

  if [[ "$deployment_ready" != true ]]; then
    die 'deployment failed readiness; release state was not advanced'
  fi

  if [[ "$has_current" == true && "$current_image" != "$new_image" ]]; then
    write_release_file "$PREVIOUS_RELEASE_FILE" "$current_image" "$current_revision"
  fi
  write_release_file "$CURRENT_RELEASE_FILE" "$new_image" "$new_revision"
  log "deployment complete: $new_revision"
)

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
