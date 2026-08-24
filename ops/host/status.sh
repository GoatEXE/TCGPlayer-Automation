#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

require_root
require_command docker
load_host_config

image_ref=''
revision=''
if ! read_release_file "$CURRENT_RELEASE_FILE" image_ref revision; then
  die 'no valid current release is recorded; deploy a release first'
fi

printf 'release_revision=%s\nrelease_image=%s\n' "$revision" "$image_ref"
export RELEASE_REVISION_FOR_COMPOSE="$revision"
compose_for_release "$image_ref" --profile prod ps
if ! smoke_release; then
  exit 1
fi
