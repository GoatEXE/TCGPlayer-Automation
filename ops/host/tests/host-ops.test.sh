#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

readonly VALID_REVISION="0123456789abcdef0123456789abcdef01234567"
readonly VALID_IMAGE="tcgplayer-automation:revision-${VALID_REVISION}"

expect_success() {
  "$@" >/dev/null
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    echo "expected command to fail: $*" >&2
    exit 1
  fi
}

expect_success validate_revision "$VALID_REVISION"
expect_failure validate_revision 012345
expect_failure validate_revision ABCDEF0123456789abcdef0123456789abcdef
expect_success validate_repository_url https://github.com/GoatEXE/TCGPlayer-Automation.git
expect_failure validate_repository_url git@github.com:GoatEXE/TCGPlayer-Automation.git
expect_success validate_release_metadata "$VALID_IMAGE" "$VALID_REVISION"
expect_failure validate_release_metadata 'tcgplayer-automation:latest' "$VALID_REVISION"
expect_failure validate_release_metadata 'tcgplayer-automation:revision-not-a-commit' "$VALID_REVISION"
expect_failure validate_release_metadata "$VALID_IMAGE" not-a-commit

expect_success validate_service_name app
expect_success validate_service_name db
expect_success validate_service_name redis
expect_failure validate_service_name app-dev
expect_failure validate_service_name 'app; rm -rf /'

release_file="$(mktemp)"
trap 'rm -f "$release_file"' EXIT
printf '%s\n%s\n' "$VALID_IMAGE" "$VALID_REVISION" > "$release_file"
image=''
revision=''
expect_success read_release_file "$release_file" image revision
[[ "$image" == "$VALID_IMAGE" ]]
[[ "$revision" == "$VALID_REVISION" ]]
printf 'unexpected-third-line\n' >> "$release_file"
expect_failure read_release_file "$release_file" image revision

echo "host ops validation tests passed"
