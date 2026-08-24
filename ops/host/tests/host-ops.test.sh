#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

export GHCR_IMAGE_REPOSITORY="ghcr.io/example/tcgplayer-automation"
readonly VALID_DIGEST="sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
readonly VALID_REVISION="0123456789abcdef0123456789abcdef01234567"

expect_success() {
  "$@" >/dev/null
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    echo "expected command to fail: $*" >&2
    exit 1
  fi
}

expect_success validate_release_metadata \
  "${GHCR_IMAGE_REPOSITORY}@${VALID_DIGEST}" "$VALID_REVISION"
expect_failure validate_release_metadata \
  "${GHCR_IMAGE_REPOSITORY}:latest" "$VALID_REVISION"
expect_failure validate_release_metadata \
  "ghcr.io/other/tcgplayer-automation@${VALID_DIGEST}" "$VALID_REVISION"
expect_failure validate_release_metadata \
  "${GHCR_IMAGE_REPOSITORY}@sha256:not-a-digest" "$VALID_REVISION"
expect_failure validate_release_metadata \
  "${GHCR_IMAGE_REPOSITORY}@${VALID_DIGEST}" "not-a-commit"

expect_success validate_service_name app
expect_success validate_service_name db
expect_success validate_service_name redis
expect_failure validate_service_name app-dev
expect_failure validate_service_name 'app; rm -rf /'

release_file="$(mktemp)"
trap 'rm -f "$release_file"' EXIT
printf '%s\n%s\n' "${GHCR_IMAGE_REPOSITORY}@${VALID_DIGEST}" "$VALID_REVISION" > "$release_file"
image=''
revision=''
expect_success read_release_file "$release_file" image revision
[[ "$image" == "${GHCR_IMAGE_REPOSITORY}@${VALID_DIGEST}" ]]
[[ "$revision" == "$VALID_REVISION" ]]
printf 'unexpected-third-line\n' >> "$release_file"
expect_failure read_release_file "$release_file" image revision

echo "host ops validation tests passed"
