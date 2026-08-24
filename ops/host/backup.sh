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

image_ref=''
revision=''
release_state='recorded'
case "$#" in
  0)
    read_release_file "$CURRENT_RELEASE_FILE" image_ref revision ||
      die 'no valid current release is recorded'
    ;;
  2)
    image_ref="$1"
    revision="$2"
    validate_release_metadata "$image_ref" "$revision" || die 'invalid release metadata'
    release_state='pre-adoption'
    ;;
esac
export RELEASE_REVISION_FOR_COMPOSE="$revision"

mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/postgres-${timestamp}-${revision:0:12}.dump"
metadata_file="$backup_file.release"
temp_file="$(mktemp "$BACKUP_DIR/.postgres.XXXXXX")"
cleanup() {
  rm -f "$temp_file"
}
trap cleanup EXIT

log 'creating a PostgreSQL custom-format backup'
compose_for_release "$image_ref" --profile prod exec -T db sh -ec \
  'exec pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$temp_file"
[[ -s "$temp_file" ]] || die 'database backup is empty'
chmod 0600 "$temp_file"
mv "$temp_file" "$backup_file"
printf 'created_at=%s\nrelease_state=%s\nrevision=%s\nimage=%s\n' \
  "$timestamp" "$release_state" "$revision" "$image_ref" > "$metadata_file"
chmod 0600 "$metadata_file"
sha256sum "$backup_file" > "$backup_file.sha256"
chmod 0600 "$backup_file.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f -mtime "+$BACKUP_RETENTION_DAYS" \
  \( -name 'postgres-*.dump' -o -name 'postgres-*.dump.release' -o -name 'postgres-*.dump.sha256' \) \
  -delete
log "backup complete: $backup_file"
