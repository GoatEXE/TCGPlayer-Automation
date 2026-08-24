#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat >&2 <<'USAGE'
Usage: sudo ./ops/host/install.sh [--env-file PATH] [--host-config PATH]

Installs or updates the stable root-owned dispatcher/wrappers. The two config
arguments are required on first install and optional on later wrapper updates.
The production Compose file and release implementation stay in the root-owned
repository checkout and are selected by the deployed revision.
USAGE
}

app_env_source=''
host_config_source=''
while (($#)); do
  case "$1" in
    --env-file)
      (($# >= 2)) || { usage; exit 2; }
      app_env_source="$2"
      shift 2
      ;;
    --host-config)
      (($# >= 2)) || { usage; exit 2; }
      host_config_source="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

ensure_managed_checkout() {
  if [[ -e "$INSTALL_DIR/.git" ]]; then
    checkout_is_safe || die 'managed repository checkout is not safe to retain'
  else
    [[ ! -e "$INSTALL_DIR" || -z "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] ||
      die "refusing to clone into non-empty directory: $INSTALL_DIR"
    log "cloning public repository checkout into $INSTALL_DIR"
    git clone --origin origin "$REPOSITORY_URL" "$INSTALL_DIR" >/dev/null
  fi
  git_in_checkout config core.hooksPath /dev/null
  checkout_is_safe || die 'managed repository checkout failed safety validation'
}

require_root
require_command docker
require_command git
docker compose version >/dev/null

if [[ -z "$app_env_source" && ! -f "$ENV_FILE" ]]; then
  die '--env-file is required on first install'
fi
if [[ -z "$host_config_source" && ! -f "$HOST_CONFIG_FILE" ]]; then
  die '--host-config is required on first install'
fi
[[ -z "$app_env_source" || -r "$app_env_source" ]] || die "cannot read $app_env_source"
[[ -z "$host_config_source" || -r "$host_config_source" ]] || die "cannot read $host_config_source"

install -d -o root -g root -m 0755 "$CONFIG_DIR" "$LIBEXEC_DIR"
install -d -o root -g root -m 0700 "$STATE_DIR" "$BACKUP_DIR"
if [[ -n "$app_env_source" ]]; then
  install -o root -g root -m 0600 "$app_env_source" "$ENV_FILE"
fi
if [[ -n "$host_config_source" ]]; then
  install -o root -g root -m 0644 "$host_config_source" "$HOST_CONFIG_FILE"
fi

load_host_config
if [[ ! -e "$INSTALL_DIR" ]]; then
  install -d -o root -g root -m 0755 "$INSTALL_DIR"
fi
ensure_managed_checkout

install -o root -g root -m 0644 "$SCRIPT_DIR/lib/common.sh" "$LIBEXEC_DIR/common.sh"
for script in status logs backup deploy rollback smoke dispatch; do
  bash -n "$SCRIPT_DIR/${script}.sh"
  mode=0750
  [[ "$script" == dispatch ]] && mode=0755
  install -o root -g root -m "$mode" "$SCRIPT_DIR/${script}.sh" "$LIBEXEC_DIR/$script"
done

placeholder_revision=0000000000000000000000000000000000000000
placeholder_image="$(local_image_for_revision "$placeholder_revision")"
RELEASE_REVISION_FOR_COMPOSE="$placeholder_revision" \
  APP_IMAGE="$placeholder_image" \
  APP_ENV_FILE="$ENV_FILE" \
  COMPOSE_PROFILES=prod \
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    --file "$COMPOSE_FILE" \
    config --quiet

log "installed stable host wrappers under $LIBEXEC_DIR"
log "versioned release files and Compose remain in $INSTALL_DIR"
log 'no containers were started or replaced'
