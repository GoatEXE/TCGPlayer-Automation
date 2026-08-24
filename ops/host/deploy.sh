#!/usr/bin/env bash
# Stable root-owned deployment boundary. Keep this wrapper installed; it safely
# selects an approved master revision before loading versioned release logic.
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

deploy_revision() {
  local revision="$1"
  local release_script="$INSTALL_DIR/ops/host/release.sh"

  validate_revision "$revision" || die 'usage: deploy REVISION'
  prepare_checkout_for_deploy "$revision" || die 'refusing unsafe or out-of-order repository checkout'
  [[ -r "$release_script" && ! -L "$release_script" ]] ||
    die "missing versioned release implementation: $release_script"

  exec env TCGPLAYER_RELEASE_DISPATCHED=1 bash "$release_script" deploy "$revision"
}

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
