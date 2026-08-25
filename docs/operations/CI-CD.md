# CI/CD and production authorization

The repository uses GitHub-hosted runners only. No workflow uses
`pull_request_target`, repository write credentials in pull-request jobs, or a
self-hosted production runner. The application release image is **not**
published to or pulled from a registry: the host builds the approved source
locally.

## Trust chain: why an eligible `master` merge authorizes production

After the one-time cutover below, production has no per-run Environment
reviewer prompt. The authorization is deliberately moved to the protected
`master` merge:

1. GitHub branch protection accepts a change to `master` only through a pull
   request with the four required checks: `Node checks`, `Host operations`,
   `Compose integration`, and `Analyze (javascript-typescript)`.
2. The `production` Environment permits deployment from the custom branch
   policy containing **only** `master`. Its required-reviewer rule is removed
   only after the audit and typed confirmation succeed.
3. A successful `CI` **push** run on `master` causes `Release production` to
   run. The release job is still bound to the `production` Environment, so it
   receives production configuration only under that Environment's policy.
4. The release workflow records the CI run's `head_sha`, checks out the current
   `master` tip, and stops unless that checkout is exactly the same 40-character
   SHA. An older successful run therefore cannot deploy after a later merge.
5. The runner joins Tailscale and, with strict pinned-host-key SSH, can send
   only `deploy <40-lowercase-hex-SHA>` to the forced-command `deploy` account.
   The root-owned host wrapper independently verifies a clean public checkout,
   confirms that requested SHA is the current `origin/master`, and only then
   selects it.

Thus an ordinary protected merge is production authorization **only while**
those branch and Environment controls remain configured as described. A person
who can bypass branch protection, alter Environment policy, or change
production secrets changes that authorization boundary. Limit administrator and
bypass access accordingly; the audit cannot prove GitHub's human access model
or tailnet ACLs.

The required CodeQL context is produced by the separate `CodeQL` workflow;
the `CI` workflow is the workflow that triggers release. Branch protection,
not a claim that all four checks belong to one workflow file, is what requires
all four before a pull request can merge.

## Recurring deployment flow

For every eligible protected `master` merge after cutover:

1. GitHub starts the `CI` push run. It validates Node, host-operation, and
   Compose work. A successful push run on `master` meets the `workflow_run`
   condition in `.github/workflows/release-production.yml`.
2. `Release production` checks out `master` and rejects the run if its checkout
   no longer equals `github.event.workflow_run.head_sha`. It validates the
   exact SHA and nonempty production Environment configuration before network
   access.
3. The ephemeral GitHub runner joins the tailnet with the scoped Tailscale OAuth
   client/tag, creates temporary SSH key and known-host files, and uses SSH
   with `StrictHostKeyChecking=yes` to request `deploy SHA` as `deploy`.
4. The host's forced dispatcher accepts no shell, image tag, digest, branch, or
   extra argument. Its root wrapper validates the clean configured public
   checkout, confirms the SHA is the current `origin/master`, fetches that
   public ref, detached-checks out the exact SHA, and invokes that revision's
   `ops/host/release.sh`.
5. The versioned release builds
   `tcgplayer-automation:revision-<SHA>` locally and verifies its OCI revision
   label. It starts and waits for PostgreSQL and Redis, makes a pre-deploy
   PostgreSQL backup using the recorded release's Compose definition, runs the
   one-shot migration job from the target image, replaces the app, and waits for
   loopback `/ready`.
6. Only after readiness succeeds does the host write the deterministic
   `current-release` state and, when applicable, move the former current
   release to `previous-release`. The source, Dockerfile, Compose file,
   migrations, and release implementation all come from the same approved SHA.

Deployments are serialized (`production` concurrency) and are never canceled
mid-operation. The release workflow has read-only repository permissions; it
has no package-registry permissions or image input. Action dependencies are
pinned to full commit SHAs.

## One-time automatic-deployment cutover

Keep the `production` Environment's required-reviewer rule until both the
repository and host prerequisites have passed. This is a deliberate one-time
approval: it proves the manual-review path first, then makes the protected
merge the recurring approval.

### Prerequisites

Before running the GitHub audit, an administrator must confirm all of the
following:

- `master` is protected with pull requests required and all four exact check
  names listed in [Trust chain](#trust-chain-why-an-eligible-master-merge-authorizes-production).
- The `production` Environment exists, has one active required-reviewer rule,
  and uses **custom** deployment branch policies with exactly one policy:
  `master`. It must not use the "all protected branches" mode.
- The Environment contains these values. The audit evaluates only their names.
  GitHub's Environment-variable API response includes variable values, which
  `gh api` fetches into transient JSON; the script neither prints nor evaluates
  those values.

  | Type | Name | Purpose |
  | --- | --- | --- |
  | Secret | `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
  | Secret | `TS_OAUTH_SECRET` | Tailscale OAuth secret |
  | Variable | `TS_TAGS` | Scoped ephemeral CI-node tag(s) |
  | Variable | `PRODUCTION_SSH_HOST` | Tailnet DNS name or IPv4 address; IPv6 literals are rejected by the workflow |
  | Variable | `PRODUCTION_SSH_PORT` | Optional SSH port; workflow defaults to `22` |
  | Secret | `PRODUCTION_SSH_PRIVATE_KEY` | Dedicated forced-command `deploy` key |
  | Secret | `PRODUCTION_SSH_HOST_KEYS` | Out-of-band verified OpenSSH known-hosts line(s) |

- Tailscale ACLs allow that CI tag to reach only the intended host SSH port;
  the app and SSH are not publicly exposed.
- The host has completed the appropriate [fresh-host or
  current-host procedure](HOST-OPERATIONS.md#fresh-host-first-install) and a
  successful reviewed deployment. Run the installed read-only preflight as
  root and resolve every failure before cutover.
- The operator workstation has authenticated `gh` and `jq`. `--apply` requires
  GitHub repository administration rights. The script does not configure
  GitHub authentication or any prerequisite for you.

### Audit first (no GitHub change)

From this repository checkout, run the read-only audit:

```bash
bash ops/github/production-cutover-audit.sh \
  --repo GoatEXE/TCGPlayer-Automation
```

It fetches branch protection; the `production` Environment and its deployment
branch policies; and Environment secret/variable responses. The
Environment-variable response includes values and is held transiently by
`gh api`, but the script extracts and evaluates **names only** and never prints
secret or variable values. It requires the active required-reviewer rule to be
present and makes no write request. Fix every reported issue and repeat the
audit until it passes.

### Typed apply (the only repository-side cutover mutation)

After a human has approved the passing audit, run exactly:

```bash
bash ops/github/production-cutover-audit.sh \
  --repo GoatEXE/TCGPlayer-Automation \
  --apply \
  --confirm REMOVE_PRODUCTION_REQUIRED_REVIEWERS
```

`--apply` runs the same audit again before making its one write request. It
sends a single `PUT` for the `production` Environment with `reviewers: []`.
The payload carries forward the existing wait timer, `prevent_self_review`
value, and deployment-branch-policy mode; it does not write branch protection,
branch-policy entries, Environment secrets, Environment variables, Tailscale
settings, SSH settings, a workflow file, or host state. It never prints secret
values.

After GitHub accepts that request, the script re-reads the Environment and
branch policies and verifies two facts: there are no required-reviewer rules,
and the custom branch policy is still exactly `master`. It does **not** retry a
failed write and it cannot restore reviewers.

### If apply post-verification fails

A failed audit before the `PUT` changes nothing. A failed `PUT` is not retried.
If the `PUT` succeeds but post-verification cannot read or validate GitHub's
response, the Environment is **indeterminate**: do not assume automatic
production deployment is enabled or safely configured, and do not rerun
`--apply` as a blind retry.

An administrator must inspect the `production` Environment in GitHub (or make
an equivalent authenticated read) and confirm its custom policy still contains
only `master` and whether a required-reviewer rule remains. If the policy is
wrong, or if deployment must be paused while investigating, manually restore a
required-reviewer rule in GitHub, preserving the intended wait/self-review
settings. Correct the Environment, then rerun the read-only audit; it will pass
only when an active reviewer rule is again present. Record the result before
attempting a new approved cutover.

## Failure handling and manual rollback

A failed automatic deployment leaves the GitHub job failed. Once the host has
selected a target and has a recorded current release, its finalizer attempts to
return the checkout and running app to that recorded current image/revision;
release-state files are not advanced on a failed build, backup, migration,
container start, or readiness check. This is best-effort application recovery,
not a database rollback. A first deployment with no recorded release has no
previous app to restore.

For a deliberate application rollback, use the host procedure and command in
[Manual rollback](HOST-OPERATIONS.md#manual-rollback). Do not try to deploy an
old SHA through CI or the SSH command: the stable wrapper intentionally accepts
only the current `origin/master` SHA. Database migrations are not reversed;
restore a tested backup manually when application rollback alone is insufficient.

## Cutover acceptance checklist

Before treating protected merges as automatic production authorization, verify:

- [ ] GitHub branch protection requires pull requests and all four exact checks.
- [ ] `production` is custom-policy, exactly `master`, and initially has its
  active reviewer rule.
- [ ] Required Environment names, Tailscale ACL, SSH key, and pinned host key
  are installed; values have been verified out of band.
- [ ] A controlled reviewer-approved deployment completed at the exact SHA;
  host status, `/ready`, backup, and logs were checked.
- [ ] `sudo /usr/local/libexec/tcgplayer-automation/preflight` passes as root.
- [ ] The default GitHub audit passes; the typed apply command completes and
  post-verifies reviewer removal plus exact-master policy.
- [ ] One subsequent controlled protected `master` merge is observed reaching
  the exact-SHA deployment path without a reviewer prompt, and its release
  state/readiness is verified.
- [ ] The operator understands the root-wrapper maintenance exception and the
  backup/DR limits in [Host operations](HOST-OPERATIONS.md).
