#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

load_host_config
original_command="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$original_command" =~ ^deploy\ (ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64})\ ([0-9a-f]{40})$ ]]; then
  die 'only a validated digest-pinned deploy command is permitted'
fi

image_ref="${BASH_REMATCH[1]}"
revision="${BASH_REMATCH[2]}"
validate_release_metadata "$image_ref" "$revision" || die 'release metadata is not allowed'

exec sudo -- "$SCRIPT_DIR/deploy" "$image_ref" "$revision"
