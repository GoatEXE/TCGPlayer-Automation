#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly PROJECT_NAME="tcgplayer-automation"
readonly TEST_REVISION="0123456789abcdef0123456789abcdef01234567"
readonly TEST_IMAGE="tcgplayer-automation:revision-${TEST_REVISION}"
readonly app_env_file="$REPO_ROOT/ops/host/config/app.env.example"

# Match compose_for_release in ops/host/lib/common.sh and the profile/service
# selection from release.sh's `run --rm migrate` command. `config` validates
# the same profile/dependency graph without creating containers or touching
# the preserved production volumes.
COMPOSE_PROFILES=prod \
  APP_IMAGE="$TEST_IMAGE" \
  APP_ENV_FILE="$app_env_file" \
  RELEASE_REVISION_FOR_COMPOSE="$TEST_REVISION" \
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$app_env_file" \
    --file "$REPO_ROOT/docker-compose.yml" \
    --profile ops \
    config --quiet migrate

compose_render="$(
  COMPOSE_PROFILES=prod \
    APP_IMAGE="$TEST_IMAGE" \
    APP_ENV_FILE="$app_env_file" \
    docker compose \
      --project-name "$PROJECT_NAME" \
      --env-file "$app_env_file" \
      --file "$REPO_ROOT/docker-compose.yml" \
      --profile ops \
      config
)"
printf '%s\n' "$compose_render" | grep -A20 '^  migrate:' | grep -F 'redis:' >/dev/null
printf '%s\n' "$compose_render" | grep -A20 '^  migrate:' | grep -F 'condition: service_healthy' >/dev/null

echo "production migration Compose profile test passed"
