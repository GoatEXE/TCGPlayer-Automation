#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

dispatch_deploy() {
  local original_command="${SSH_ORIGINAL_COMMAND:-}"

  if [[ ! "$original_command" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
    die 'only a validated exact-revision deploy command is permitted'
  fi
  exec sudo -- "$SCRIPT_DIR/deploy" "${BASH_REMATCH[1]}"
}

main() {
  load_host_config
  dispatch_deploy
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
