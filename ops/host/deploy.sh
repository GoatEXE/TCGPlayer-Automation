#!/usr/bin/env bash
# Stable root-owned deployment boundary. Keep this wrapper installed; it safely
# selects an approved master revision before loading versioned release logic.
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

restore_wrapper_recorded_checkout() {
  local current_revision="$1"

  if prepare_checkout_for_recorded_release "$current_revision"; then
    return 0
  fi

  # The wrapper validated this recorded revision against the fetched target
  # before selecting it. A transient remote failure must not leave old release
  # metadata paired with the target's versioned Compose files.
  log 'WARNING: remote verification failed during wrapper restoration; using the verified local recorded revision'
  checkout_exact_revision "$current_revision" || return 1
  assert_checkout_at_revision "$current_revision"
}

wrapper_deploy_finalizer() {
  local exit_status="$1"
  local target_checkout_attempted="$2"
  local has_current="$3"
  local current_revision="$4"

  trap - EXIT
  if [[ "$exit_status" -ne 0 && "$target_checkout_attempted" == true && "$has_current" == true ]] &&
    ! assert_checkout_at_revision "$current_revision" 2>/dev/null; then
    log "deployment exited before checkout cleanup completed; restoring recorded current revision $current_revision"
    restore_wrapper_recorded_checkout "$current_revision" ||
      log 'WARNING: could not restore the recorded current release checkout'
  fi
  exit "$exit_status"
}

deploy_revision() (
  local revision="$1"
  local release_script="$INSTALL_DIR/ops/host/release.sh"
  local current_revision=''
  local has_current=false
  local target_checkout_attempted=false

  # release.sh can fail before release_deploy installs its own finalizer (for
  # example, while validating its command line). Keep this stable boundary
  # alive until the versioned implementation returns.
  trap 'wrapper_deploy_finalizer "$?" "$target_checkout_attempted" "$has_current" "$current_revision"' EXIT

  validate_revision "$revision" || die 'usage: deploy REVISION'
  prepare_deploy_target_revision "$revision" ||
    die 'refusing unsafe or out-of-order repository checkout'
  load_recorded_checkout_restore_state "$revision" has_current current_revision ||
    die 'recorded release state is invalid or cannot be safely restored'

  target_checkout_attempted=true
  checkout_exact_revision "$revision" || die 'could not select the requested release revision'
  [[ -r "$release_script" && ! -L "$release_script" ]] ||
    die "missing versioned release implementation: $release_script"

  # Do not exec: this wrapper must observe an early versioned-script failure
  # and restore the already validated recorded checkout before returning.
  env TCGPLAYER_RELEASE_DISPATCHED=1 bash "$release_script" deploy "$revision" || exit "$?"
)

main() {
  (($# == 1)) || die 'usage: deploy REVISION'
  require_root
  require_command git
  load_host_config
  acquire_deploy_lock
  deploy_revision "$1"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
