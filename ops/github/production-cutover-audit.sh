#!/usr/bin/env bash
# Read-only by default. The guarded apply mode removes only production
# Environment required reviewers after a human has completed the audit.
set -euo pipefail

readonly CONFIRMATION_TEXT='REMOVE_PRODUCTION_REQUIRED_REVIEWERS'
readonly PRODUCTION_ENVIRONMENT='production'
readonly -a REQUIRED_CHECKS=(
  'Node checks'
  'Android checks'
  'Host operations'
  'Compose integration'
  'Analyze (javascript-typescript)'
  'Analyze (java-kotlin)'
)
readonly -a REQUIRED_SECRETS=(
  'TS_OAUTH_CLIENT_ID'
  'TS_OAUTH_SECRET'
  'PRODUCTION_SSH_PRIVATE_KEY'
  'PRODUCTION_SSH_HOST_KEYS'
)
readonly -a REQUIRED_VARIABLES=(
  'TS_TAGS'
  'PRODUCTION_SSH_HOST'
)
readonly OPTIONAL_VARIABLE='PRODUCTION_SSH_PORT'

GH_BIN="${GH_BIN:-gh}"
JQ_BIN="${JQ_BIN:-jq}"
REPOSITORY=''
APPLY=false
CONFIRMATION=''
TEMP_DIR=''
FAILURES=0

usage() {
  cat <<'USAGE'
Usage: ops/github/production-cutover-audit.sh --repo OWNER/REPOSITORY [--apply --confirm REMOVE_PRODUCTION_REQUIRED_REVIEWERS]

Audits the GitHub controls used by automatic production deployment. The default
mode is read-only and does not alter GitHub settings. It verifies protected
master, the six CI checks, the production Environment, its exact-master custom
branch policy, required secret/variable names, and current reviewer gate.

--apply is intentionally narrow: after a passing audit and the exact typed
confirmation, it removes only the production Environment required-reviewer
rule. It preserves the existing Environment branch-policy settings, wait timer,
self-review setting, secrets, and variables. It never prints secret values.

Required production Environment secret names:
  TS_OAUTH_CLIENT_ID, TS_OAUTH_SECRET, PRODUCTION_SSH_PRIVATE_KEY,
  PRODUCTION_SSH_HOST_KEYS
Required variable names: TS_TAGS, PRODUCTION_SSH_HOST
Optional variable name: PRODUCTION_SSH_PORT (the workflow defaults to 22).

Requires authenticated GitHub CLI access with repository administration rights
only when using --apply; jq is required for local JSON validation.
USAGE
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

pass() {
  printf 'PASS: %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'FAIL: required command not found: %s\n' "$1" >&2
    exit 2
  }
}

api_get() {
  "$GH_BIN" api --method GET "$1"
}

require_name() {
  local name="$1"
  local names_file="$2"
  local kind="$3"

  if grep -Fqx -- "$name" "$names_file"; then
    pass "production Environment ${kind} name present: ${name}"
  else
    fail "production Environment is missing required ${kind} name: ${name}"
  fi
}

verify_branch_protection() {
  local protection_file="$1"
  local checks_file="$TEMP_DIR/required-checks.txt"
  local check

  if ! "$JQ_BIN" -e '.required_pull_request_reviews != null' "$protection_file" >/dev/null; then
    fail 'master branch protection does not require pull requests'
  else
    pass 'master branch protection requires pull requests'
  fi

  "$JQ_BIN" -r '[.required_status_checks.contexts[]?, .required_status_checks.checks[]?.context] | unique[]?' \
    "$protection_file" > "$checks_file"
  for check in "${REQUIRED_CHECKS[@]}"; do
    if grep -Fqx -- "$check" "$checks_file"; then
      pass "master required check present: ${check}"
    else
      fail "master branch protection is missing required check: ${check}"
    fi
  done
}

verify_exact_master_policy() {
  local environment_file="$1"
  local policies_file="$2"
  local names_file="$TEMP_DIR/production-branch-policies.txt"
  local policy_count

  if ! "$JQ_BIN" -e \
    '.deployment_branch_policy.protected_branches == false and .deployment_branch_policy.custom_branch_policies == true' \
    "$environment_file" >/dev/null; then
    fail 'production Environment must use custom deployment branch policies (not all protected branches)'
    return
  fi

  "$JQ_BIN" -r 'if type == "array" then .[]?.name else .branch_policies[]?.name end' \
    "$policies_file" > "$names_file"
  policy_count="$(grep -c . "$names_file" || true)"
  if [[ "$policy_count" == 1 ]] && grep -Fqx 'master' "$names_file"; then
    pass 'production Environment deployment branch policy is exactly master'
  else
    fail 'production Environment deployment branch policy must contain exactly one custom branch: master'
  fi
}

verify_reviewer_state() {
  local environment_file="$1"
  local rule_count reviewers prevent_self_review

  rule_count="$("$JQ_BIN" '[.protection_rules[]? | select(.type == "required_reviewers")] | length' "$environment_file")"
  if [[ "$rule_count" != 1 ]]; then
    fail 'production Environment must have exactly one required-reviewer rule before cutover'
    return
  fi

  reviewers="$("$JQ_BIN" -r '[.protection_rules[]? | select(.type == "required_reviewers") | .reviewers[]? | "\(.type // "reviewer"):\(.reviewer.login // .reviewer.slug // .reviewer.name // .reviewer.id // "unknown")"] | join(", ")' "$environment_file")"
  prevent_self_review="$("$JQ_BIN" -r '[.protection_rules[]? | select(.type == "required_reviewers") | .prevent_self_review] | first // false' "$environment_file")"
  if [[ -z "$reviewers" ]]; then
    fail 'production Environment required-reviewer rule has no reviewers'
    return
  fi

  pass "production Environment required reviewers are active (${reviewers}; prevent self-review: ${prevent_self_review})"
}

verify_environment_names() {
  local secrets_file="$1"
  local variables_file="$2"
  local secret_names="$TEMP_DIR/production-secret-names.txt"
  local variable_names="$TEMP_DIR/production-variable-names.txt"
  local name

  "$JQ_BIN" -r '.secrets[]?.name' "$secrets_file" > "$secret_names"
  "$JQ_BIN" -r '.variables[]?.name' "$variables_file" > "$variable_names"
  for name in "${REQUIRED_SECRETS[@]}"; do
    require_name "$name" "$secret_names" 'secret'
  done
  for name in "${REQUIRED_VARIABLES[@]}"; do
    require_name "$name" "$variable_names" 'variable'
  done
  if grep -Fqx -- "$OPTIONAL_VARIABLE" "$variable_names"; then
    pass "production Environment optional variable name present: ${OPTIONAL_VARIABLE}"
  else
    pass "production Environment optional variable name absent: ${OPTIONAL_VARIABLE} (workflow uses port 22)"
  fi
}

read_audit_data() {
  local base="repos/${REPOSITORY}"

  if ! api_get "${base}/branches/master/protection" > "$TEMP_DIR/master-protection.json"; then
    fail 'could not read master branch protection; authenticate gh and verify repository administration access'
    return 1
  fi
  if ! api_get "${base}/environments/${PRODUCTION_ENVIRONMENT}" > "$TEMP_DIR/production-environment.json"; then
    fail 'could not read the production Environment; create it before cutover'
    return 1
  fi
  if ! api_get "${base}/environments/${PRODUCTION_ENVIRONMENT}/deployment-branch-policies" > "$TEMP_DIR/production-branch-policies.json"; then
    fail 'could not read production Environment deployment branch policies'
    return 1
  fi
  if ! api_get "${base}/environments/${PRODUCTION_ENVIRONMENT}/secrets" > "$TEMP_DIR/production-secrets.json"; then
    fail 'could not read production Environment secret names'
    return 1
  fi
  if ! api_get "${base}/environments/${PRODUCTION_ENVIRONMENT}/variables" > "$TEMP_DIR/production-variables.json"; then
    fail 'could not read production Environment variable names'
    return 1
  fi
}

run_audit() {
  read_audit_data || return 1
  verify_branch_protection "$TEMP_DIR/master-protection.json"
  verify_exact_master_policy \
    "$TEMP_DIR/production-environment.json" \
    "$TEMP_DIR/production-branch-policies.json"
  verify_environment_names \
    "$TEMP_DIR/production-secrets.json" \
    "$TEMP_DIR/production-variables.json"
  verify_reviewer_state "$TEMP_DIR/production-environment.json"

  if ((FAILURES > 0)); then
    printf 'Audit failed with %d actionable issue(s). No GitHub settings were changed.\n' "$FAILURES" >&2
    return 1
  fi
  printf 'Audit passed. Default mode is read-only; no GitHub settings were changed.\n'
}

remove_required_reviewers() {
  local base="repos/${REPOSITORY}"
  local payload_file="$TEMP_DIR/remove-reviewers-payload.json"

  "$JQ_BIN" -c '
    {
      wait_timer: ([.protection_rules[]? | select(.type == "wait_timer") | .wait_timer] | first // 0),
      prevent_self_review: ([.protection_rules[]? | select(.type == "required_reviewers") | .prevent_self_review] | first // false),
      reviewers: [],
      deployment_branch_policy: .deployment_branch_policy
    }
  ' "$TEMP_DIR/production-environment.json" > "$payload_file"

  if ! "$GH_BIN" api --method PUT "${base}/environments/${PRODUCTION_ENVIRONMENT}" --input "$payload_file" >/dev/null; then
    printf 'FAIL: GitHub did not accept removal of the production Environment reviewer rule. No retry was attempted.\n' >&2
    return 1
  fi

  # Re-read only the Environment and its policy. This proves the narrow update
  # removed reviewers while leaving the exact-master policy intact.
  if ! api_get "${base}/environments/${PRODUCTION_ENVIRONMENT}" > "$TEMP_DIR/production-environment-after.json" ||
    ! api_get "${base}/environments/${PRODUCTION_ENVIRONMENT}/deployment-branch-policies" > "$TEMP_DIR/production-branch-policies-after.json"; then
    printf 'FAIL: reviewer update completed but post-update verification could not read the production Environment. Investigate before deploying.\n' >&2
    return 1
  fi

  FAILURES=0
  verify_exact_master_policy \
    "$TEMP_DIR/production-environment-after.json" \
    "$TEMP_DIR/production-branch-policies-after.json"
  local reviewer_rule_count
  reviewer_rule_count="$("$JQ_BIN" '[.protection_rules[]? | select(.type == "required_reviewers")] | length' "$TEMP_DIR/production-environment-after.json")"
  if [[ "$reviewer_rule_count" != 0 ]]; then
    fail 'production Environment still has a required-reviewer rule after apply'
  else
    pass 'production Environment required-reviewer rule removed'
  fi

  if ((FAILURES > 0)); then
    printf 'Apply completed but post-update verification failed. Do not assume automatic deployment is enabled.\n' >&2
    return 1
  fi
  printf 'Cutover complete: production reviewer approval is removed; Environment branch policy and named configuration were not changed.\n'
}

while (($#)); do
  case "$1" in
    --repo)
      (($# >= 2)) || { usage >&2; exit 2; }
      REPOSITORY="$2"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --confirm)
      (($# >= 2)) || { usage >&2; exit 2; }
      CONFIRMATION="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$REPOSITORY" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || {
  printf 'FAIL: --repo must be OWNER/REPOSITORY\n' >&2
  exit 2
}
if [[ "$APPLY" == true && "$CONFIRMATION" != "$CONFIRMATION_TEXT" ]]; then
  printf 'FAIL: --apply requires --confirm %s\n' "$CONFIRMATION_TEXT" >&2
  exit 2
fi
if [[ "$APPLY" == false && -n "$CONFIRMATION" ]]; then
  printf 'FAIL: --confirm is valid only with --apply\n' >&2
  exit 2
fi

require_command "$GH_BIN"
require_command "$JQ_BIN"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

run_audit
if [[ "$APPLY" == true ]]; then
  remove_required_reviewers
fi
