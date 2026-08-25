#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

(($# == 0 || $# == 2)) || die 'usage: backup [LOCAL_IMAGE REVISION]'
require_root
require_command docker
require_command sha256sum
load_host_config

# Keep the standalone command aligned with the current shared implementation.
# release.sh calls these helpers directly so a temporary recorded checkout
# supplies only its Compose file, never its obsolete scripts/config contract.
case "$#" in
  0)
    backup_recorded_release || die 'database backup failed'
    ;;
  2)
    backup_for_release "$1" "$2" pre-adoption || die 'database backup failed'
    ;;
esac
