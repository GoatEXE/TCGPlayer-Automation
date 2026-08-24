#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

service="${1:-app}"
lines="${2:-200}"
validate_service_name "$service" || die 'service must be app, db, or redis'
[[ "$lines" =~ ^[0-9]{1,5}$ ]] || die 'line count must be an integer'
(( lines >= 1 && lines <= 5000 )) || die 'line count must be between 1 and 5000'

require_root
require_command docker
load_host_config

image_ref=''
_revision=''
read_release_file "$CURRENT_RELEASE_FILE" image_ref _revision ||
  die 'no valid current release is recorded'
export RELEASE_REVISION_FOR_COMPOSE="$_revision"
compose_for_release "$image_ref" --profile prod logs --tail "$lines" "$service"
