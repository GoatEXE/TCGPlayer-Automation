# CI/CD and repository controls

The repository uses GitHub-hosted runners only. No workflow uses
`pull_request_target`, repository write credentials in PR jobs, or a
self-hosted production runner.

## Release path

1. A pull request is merged into protected `master`, which starts the `CI`
   push run. The required checks are Node checks, Android checks, Host
   operations, Compose integration, and the enabled CodeQL analyses.
2. A successful `CI` push run stages the **Release production** deployment job.
   That job is bound to the protected `production` GitHub Environment, so its
   required reviewer approval happens before it can access production secrets.
3. After approval, the runner checks out `master` and rejects the job unless
   its exact 40-character revision still equals the verified CI run revision.
   This prevents an older approved run from deploying after another merge.
4. The runner joins Tailscale, uses the pinned SSH host key, and sends only
   `deploy <40-character-revision>` to the forced-command `deploy` account.
5. The root-owned host wrapper independently checks that the public
   repository's current `origin/master` is that exact revision, rejects local
   checkout drift, then checks out the revision and invokes its versioned
   release implementation. The host builds the production image locally with
   a deterministic `tcgplayer-automation:revision-<sha>` tag.

The deploy workflow does not publish container images or require package
registry permissions. Production source, Dockerfile, Compose, migrations, and
release implementation are all taken from the approved revision. Tailscale,
strict host-key checking, SSH, and production Environment approval remain
mandatory.

Action dependencies are pinned to full commit SHAs. Workflow permissions are
read-only except CodeQL's required security-event upload. Production deployment
runs are serialized and never canceled mid-operation.

## GitHub setup gates

These controls cannot be created by repository files and must be enabled by a
repository administrator:

1. Keep the default branch named `master` and protect it. Require pull
   requests and the six current checks: `Node checks`, `Android checks`, `Host
   operations`, `Compose integration`, `Analyze (javascript-typescript)`, and
   `Analyze (java-kotlin)`.
2. Create a `production` Environment with required reviewers, restrict its
   deployment branch policy to `master`, and prevent self-review when
   appropriate. The current environment is the deployment approval boundary;
   do not replace it with an unprotected repository secret.
3. Create a narrowly scoped Tailscale OAuth client/tag. Tailnet ACLs should
   allow that CI tag to reach only the production host's SSH port.
4. Add these `production` Environment values (they are intentionally absent
   from this repository):

   | Type | Name | Purpose |
   | --- | --- | --- |
   | Secret | `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
   | Secret | `TS_OAUTH_SECRET` | Tailscale OAuth secret |
   | Variable | `TS_TAGS` | Approved ephemeral CI node tag(s) |
   | Variable | `PRODUCTION_SSH_HOST` | Tailnet DNS name or address |
   | Variable | `PRODUCTION_SSH_PORT` | SSH port; optional, defaults to 22 |
   | Secret | `PRODUCTION_SSH_PRIVATE_KEY` | Dedicated key for the forced-command `deploy` account |
   | Secret | `PRODUCTION_SSH_HOST_KEYS` | Trusted OpenSSH known-hosts line(s), verified out of band |

The deploy host must be bootstrapped separately as described in
[Host operations](HOST-OPERATIONS.md). Do not enable production deployment
until branch protection, Environment review, tailnet ACLs, host restrictions,
and the host transition steps are verified.
