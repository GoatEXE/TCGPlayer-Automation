#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/ops/github/production-cutover-audit.sh"
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

expect_failure() {
  if "$@" >"$test_root/failure-output" 2>&1; then
    fail "expected failure: $*"
  fi
}

assert_contains() {
  local expected="$1"
  local file="$2"
  grep -Fq -- "$expected" "$file" || fail "missing expected text: $expected"
}

assert_not_contains() {
  local unexpected="$1"
  local file="$2"
  if grep -Fq -- "$unexpected" "$file"; then
    fail "unexpected text present: $unexpected"
  fi
}

bin_dir="$test_root/bin"
state_dir="$test_root/state"
mkdir -p "$bin_dir" "$state_dir"

# GitHub Ubuntu runners provide jq. This small fallback only keeps the shell
# mock test runnable on Windows development shells that do not.
JQ_BIN_FOR_TEST="$(command -v jq || true)"
if [[ -z "$JQ_BIN_FOR_TEST" ]]; then
  cat > "$bin_dir/jq" <<'MOCK_JQ'
#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
let raw = false;
let compact = false;
let exists = false;
while (args[0] && args[0].startsWith('-')) {
  const option = args.shift();
  raw ||= option.includes('r');
  compact ||= option.includes('c');
  exists ||= option.includes('e');
}
const filter = args.shift();
const input = JSON.parse(fs.readFileSync(args.shift(), 'utf8'));
const reviewerRules = (input.protection_rules || []).filter((rule) => rule.type === 'required_reviewers');
let value;
if (filter.includes('required_pull_request_reviews')) {
  value = input.required_pull_request_reviews != null;
} else if (filter.includes('required_status_checks.contexts')) {
  value = [...(input.required_status_checks.contexts || []), ...(input.required_status_checks.checks || []).map((check) => check.context)].sort();
} else if (filter.includes('deployment_branch_policy.protected_branches')) {
  value = input.deployment_branch_policy?.protected_branches === false && input.deployment_branch_policy?.custom_branch_policies === true;
} else if (filter.startsWith('if type == "array"')) {
  value = Array.isArray(input) ? input.map((item) => item.name) : (input.branch_policies || []).map((item) => item.name);
} else if (filter.includes('select(.type == "required_reviewers")] | length')) {
  value = reviewerRules.length;
} else if (filter.includes('.reviewers[]? | "\\(.type')) {
  value = reviewerRules.flatMap((rule) => rule.reviewers || []).map((reviewer) => `${reviewer.type || 'reviewer'}:${reviewer.reviewer.login || reviewer.reviewer.slug || reviewer.reviewer.name || reviewer.reviewer.id || 'unknown'}`).join(', ');
} else if (filter.includes('wait_timer:')) {
  const waitRule = (input.protection_rules || []).find((rule) => rule.type === 'wait_timer');
  value = {
    wait_timer: waitRule?.wait_timer || 0,
    prevent_self_review: reviewerRules[0]?.prevent_self_review || false,
    reviewers: [],
    deployment_branch_policy: input.deployment_branch_policy,
  };
} else if (filter.includes('.prevent_self_review')) {
  value = reviewerRules[0]?.prevent_self_review || false;
} else if (filter === '.secrets[]?.name') {
  value = (input.secrets || []).map((secret) => secret.name);
} else if (filter === '.variables[]?.name') {
  value = (input.variables || []).map((variable) => variable.name);
} else if (filter.includes('.reviewers == []')) {
  value = input.reviewers?.length === 0 && input.wait_timer === 5 && input.prevent_self_review === true && input.deployment_branch_policy?.protected_branches === false && input.deployment_branch_policy?.custom_branch_policies === true;
} else if (filter.includes('has("protection_rules")')) {
  value = !Object.hasOwn(input, 'protection_rules') && !Object.hasOwn(input, 'secrets') && !Object.hasOwn(input, 'variables');
} else {
  process.exit(64);
}
if (exists && !value) process.exit(1);
if (raw) {
  for (const item of Array.isArray(value) ? value : [value]) process.stdout.write(`${item}\n`);
} else {
  process.stdout.write(`${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`);
}
MOCK_JQ
  chmod +x "$bin_dir/jq"
  JQ_BIN_FOR_TEST="$bin_dir/jq"
fi

cat > "$bin_dir/gh" <<'MOCK_GH'
#!/usr/bin/env bash
set -euo pipefail

: "${MOCK_GH_STATE_DIR:?}"
method='GET'
endpoint=''
input_file=''
while (($#)); do
  case "$1" in
    --method)
      method="$2"
      shift 2
      ;;
    --input)
      input_file="$2"
      shift 2
      ;;
    repos/*)
      endpoint="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s %s\n' "$method" "$endpoint" >> "$MOCK_GH_STATE_DIR/calls.log"

if [[ "$method" == PUT ]]; then
  [[ "$endpoint" == 'repos/example/tcgplayer-automation/environments/production' ]] || exit 64
  cp "$input_file" "$MOCK_GH_STATE_DIR/put-payload.json"
  : > "$MOCK_GH_STATE_DIR/reviewers-removed"
  printf '{"name":"production"}\n'
  exit 0
fi

case "$endpoint" in
  repos/example/tcgplayer-automation/branches/master/protection)
    if [[ "${MOCK_MISSING_CHECK:-}" == 1 ]]; then
      cat <<'JSON'
{"required_status_checks":{"contexts":["Node checks","Android checks","Host operations","Compose integration","Analyze (javascript-typescript)"]},"required_pull_request_reviews":{}}
JSON
    else
      cat <<'JSON'
{"required_status_checks":{"contexts":["Node checks","Android checks","Host operations","Compose integration","Analyze (javascript-typescript)","Analyze (java-kotlin)"]},"required_pull_request_reviews":{}}
JSON
    fi
    ;;
  repos/example/tcgplayer-automation/environments/production)
    if [[ -e "$MOCK_GH_STATE_DIR/reviewers-removed" ]]; then
      cat <<'JSON'
{"name":"production","protection_rules":[{"type":"wait_timer","wait_timer":5}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
    else
      cat <<'JSON'
{"name":"production","protection_rules":[{"type":"wait_timer","wait_timer":5},{"type":"required_reviewers","prevent_self_review":true,"reviewers":[{"type":"User","reviewer":{"login":"release-admin","id":7}}]}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
    fi
    ;;
  repos/example/tcgplayer-automation/environments/production/deployment-branch-policies)
    if [[ "${MOCK_BAD_BRANCH_POLICY:-}" == 1 ]]; then
      cat <<'JSON'
{"total_count":1,"branch_policies":[{"id":1,"name":"release/*","type":"branch"}]}
JSON
    else
      cat <<'JSON'
{"total_count":1,"branch_policies":[{"id":1,"name":"master","type":"branch"}]}
JSON
    fi
    ;;
  repos/example/tcgplayer-automation/environments/production/secrets)
    cat <<'JSON'
{"total_count":4,"secrets":[{"name":"TS_OAUTH_CLIENT_ID","value":"secret-value-must-not-print"},{"name":"TS_OAUTH_SECRET"},{"name":"PRODUCTION_SSH_PRIVATE_KEY"},{"name":"PRODUCTION_SSH_HOST_KEYS"}]}
JSON
    ;;
  repos/example/tcgplayer-automation/environments/production/variables)
    cat <<'JSON'
{"total_count":3,"variables":[{"name":"TS_TAGS","value":"variable-value-must-not-print"},{"name":"PRODUCTION_SSH_HOST"},{"name":"PRODUCTION_SSH_PORT"}]}
JSON
    ;;
  *)
    printf 'unexpected gh endpoint: %s\n' "$endpoint" >&2
    exit 64
    ;;
esac
MOCK_GH
chmod +x "$bin_dir/gh"

run_audit() {
  PATH="$bin_dir:$PATH" \
    MOCK_GH_STATE_DIR="$state_dir" \
    GH_BIN=gh \
    JQ_BIN="$JQ_BIN_FOR_TEST" \
    bash "$SCRIPT" --repo example/tcgplayer-automation
}

: > "$state_dir/calls.log"
run_audit > "$test_root/audit-output"
assert_contains 'Audit passed. Default mode is read-only' "$test_root/audit-output"
assert_contains 'required reviewers are active (User:release-admin; prevent self-review: true)' "$test_root/audit-output"
assert_not_contains 'secret-value-must-not-print' "$test_root/audit-output"
assert_not_contains 'variable-value-must-not-print' "$test_root/audit-output"
assert_not_contains 'PUT ' "$state_dir/calls.log"
[[ ! -e "$state_dir/reviewers-removed" ]] || fail 'default audit changed reviewer state'

rm -f "$state_dir/reviewers-removed" "$state_dir/put-payload.json"
: > "$state_dir/calls.log"
PATH="$bin_dir:$PATH" \
  MOCK_GH_STATE_DIR="$state_dir" \
  GH_BIN=gh \
  JQ_BIN="$JQ_BIN_FOR_TEST" \
  bash "$SCRIPT" --repo example/tcgplayer-automation --apply \
  --confirm REMOVE_PRODUCTION_REQUIRED_REVIEWERS > "$test_root/apply-output"
assert_contains 'Cutover complete: production reviewer approval is removed' "$test_root/apply-output"
[[ -e "$state_dir/reviewers-removed" ]] || fail 'apply did not remove reviewer state in mock'
[[ "$(grep -Fc 'PUT repos/example/tcgplayer-automation/environments/production' "$state_dir/calls.log")" == 1 ]] ||
  fail 'apply did not make exactly one narrow PUT request'
"$JQ_BIN_FOR_TEST" -e '.reviewers == [] and .wait_timer == 5 and .prevent_self_review == true and .deployment_branch_policy.protected_branches == false and .deployment_branch_policy.custom_branch_policies == true' \
  "$state_dir/put-payload.json" >/dev/null || fail 'apply payload did not preserve Environment settings while clearing reviewers'
"$JQ_BIN_FOR_TEST" -e '(has("protection_rules") | not) and (has("secrets") | not) and (has("variables") | not)' \
  "$state_dir/put-payload.json" >/dev/null || fail 'apply payload changed more than reviewer configuration'

rm -f "$state_dir/reviewers-removed" "$state_dir/put-payload.json"
: > "$state_dir/calls.log"
expect_failure env \
  PATH="$bin_dir:$PATH" \
  MOCK_GH_STATE_DIR="$state_dir" \
  MOCK_MISSING_CHECK=1 \
  GH_BIN=gh \
  JQ_BIN="$JQ_BIN_FOR_TEST" \
  bash "$SCRIPT" --repo example/tcgplayer-automation --apply \
  --confirm REMOVE_PRODUCTION_REQUIRED_REVIEWERS
assert_contains 'missing required check: Analyze (java-kotlin)' "$test_root/failure-output"
assert_not_contains 'PUT ' "$state_dir/calls.log"
[[ ! -e "$state_dir/reviewers-removed" ]] || fail 'failed audit changed reviewer state'

: > "$state_dir/calls.log"
expect_failure env \
  PATH="$bin_dir:$PATH" \
  MOCK_GH_STATE_DIR="$state_dir" \
  MOCK_BAD_BRANCH_POLICY=1 \
  GH_BIN=gh \
  JQ_BIN="$JQ_BIN_FOR_TEST" \
  bash "$SCRIPT" --repo example/tcgplayer-automation --apply \
  --confirm REMOVE_PRODUCTION_REQUIRED_REVIEWERS
assert_contains 'must contain exactly one custom branch: master' "$test_root/failure-output"
assert_not_contains 'PUT ' "$state_dir/calls.log"
[[ ! -e "$state_dir/reviewers-removed" ]] || fail 'invalid branch policy changed reviewer state'

: > "$state_dir/calls.log"
expect_failure env \
  PATH="$bin_dir:$PATH" \
  MOCK_GH_STATE_DIR="$state_dir" \
  GH_BIN=gh \
  JQ_BIN="$JQ_BIN_FOR_TEST" \
  bash "$SCRIPT" --repo example/tcgplayer-automation --apply --confirm wrong-confirmation
assert_contains 'requires --confirm REMOVE_PRODUCTION_REQUIRED_REVIEWERS' "$test_root/failure-output"
[[ ! -s "$state_dir/calls.log" ]] || fail 'invalid confirmation invoked GitHub CLI'

echo 'production cutover audit tests passed'
