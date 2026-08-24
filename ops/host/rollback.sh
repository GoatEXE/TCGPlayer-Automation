#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

(($# == 0)) || die 'usage: rollback'
require_root
require_command curl
require_command docker
load_host_config
acquire_deploy_lock

current_image=''
current_revision=''
previous_image=''
previous_revision=''
read_release_file "$CURRENT_RELEASE_FILE" current_image current_revision ||
  die 'no valid current release is recorded'
read_release_file "$PREVIOUS_RELEASE_FILE" previous_image previous_revision ||
  die 'no valid previous release is recorded'

log "pulling recorded rollback image for revision $previous_revision"
docker pull "$previous_image" >/dev/null
image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$previous_image")"
[[ "$image_revision" == "$previous_revision" ]] ||
  die 'rollback image revision label does not match recorded metadata'

log 'taking a pre-rollback database backup'
if [[ -x "$SCRIPT_DIR/backup" ]]; then
  "$SCRIPT_DIR/backup"
else
  bash "$SCRIPT_DIR/backup.sh"
fi

# Database migrations are intentionally not reversed. Releases must keep one-step
# schema compatibility so the previous app can run against the migrated schema.
export RELEASE_REVISION_FOR_COMPOSE="$previous_revision"
rollback_ready=true
if ! compose_for_release "$previous_image" --profile prod up -d --no-build app --wait --wait-timeout 120; then
  rollback_ready=false
elif ! smoke_release; then
  rollback_ready=false
fi

if [[ "$rollback_ready" != true ]]; then
  log 'rollback image failed readiness; restoring the current app image'
  export RELEASE_REVISION_FOR_COMPOSE="$current_revision"
  compose_for_release "$current_image" --profile prod up -d --no-build app --wait --wait-timeout 120 || true
  smoke_release || log 'WARNING: current app image also failed readiness'
  die 'rollback failed; release state was not changed'
fi

write_release_file "$CURRENT_RELEASE_FILE" "$previous_image" "$previous_revision"
write_release_file "$PREVIOUS_RELEASE_FILE" "$current_image" "$current_revision"
log "rollback complete: $previous_revision"
