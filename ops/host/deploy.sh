#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/common.sh" 2>/dev/null || source "$SCRIPT_DIR/lib/common.sh"

(($# == 2)) || die 'usage: deploy IMAGE@sha256:DIGEST REVISION'
new_image="$1"
new_revision="$2"

require_root
require_command curl
require_command docker
load_host_config
validate_release_metadata "$new_image" "$new_revision" || die 'invalid release metadata'
acquire_deploy_lock
export RELEASE_REVISION_FOR_COMPOSE="$new_revision"

current_image=''
current_revision=''
has_current=false
if read_release_file "$CURRENT_RELEASE_FILE" current_image current_revision; then
  has_current=true
fi

log "pulling digest-pinned image for revision $new_revision"
docker pull "$new_image" >/dev/null
image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$new_image")"
[[ "$image_revision" == "$new_revision" ]] ||
  die 'image revision label does not match the requested revision'

log 'starting production data services'
compose_for_release "$new_image" --profile prod up -d --no-build db redis --wait --wait-timeout 120

log 'taking a pre-deploy database backup'
backup_args=()
if [[ "$has_current" != true ]]; then
  # The target metadata lets backup address Compose before release state exists;
  # metadata marks the dump as pre-adoption rather than claiming it ran that image.
  backup_args=("$new_image" "$new_revision")
fi
if [[ -x "$SCRIPT_DIR/backup" ]]; then
  "$SCRIPT_DIR/backup" "${backup_args[@]}"
else
  bash "$SCRIPT_DIR/backup.sh" "${backup_args[@]}"
fi

log 'running the one-shot migration job'
compose_for_release "$new_image" --profile ops run --rm migrate

log 'replacing the application container'
deployment_ready=true
if ! compose_for_release "$new_image" --profile prod up -d --no-build app --wait --wait-timeout 120; then
  deployment_ready=false
elif ! smoke_release; then
  deployment_ready=false
fi

if [[ "$deployment_ready" != true ]]; then
  if [[ "$has_current" == true ]]; then
    log "new release failed readiness; restoring previous app image $current_revision"
    export RELEASE_REVISION_FOR_COMPOSE="$current_revision"
    compose_for_release "$current_image" --profile prod up -d --no-build app --wait --wait-timeout 120 || true
    smoke_release || log 'WARNING: previous app image also failed readiness'
  fi
  die 'deployment failed; release state was not advanced'
fi

if [[ "$has_current" == true && "$current_image" != "$new_image" ]]; then
  write_release_file "$PREVIOUS_RELEASE_FILE" "$current_image" "$current_revision"
fi
write_release_file "$CURRENT_RELEASE_FILE" "$new_image" "$new_revision"
log "deployment complete: $new_revision"
