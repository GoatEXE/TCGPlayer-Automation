# CI/CD and repository controls

The repository uses GitHub-hosted runners only. No workflow uses `pull_request_target`, repository write credentials in PR jobs, or a self-hosted production runner.

## Workflows

- **CI** (`.github/workflows/ci.yml`) runs for pull requests and pushes to `master`:
  - Node 22, pnpm frozen install, ESLint, Vitest, and both package builds.
  - Java 17 Android unit tests and debug assembly with the checked-in Gradle wrapper.
  - Bash syntax, host-operation validation tests, and ShellCheck.
  - dev/prod Compose rendering, the production Docker build, the one-shot migration, container health, and HTTP liveness/readiness smoke checks.
- **CodeQL** (`.github/workflows/codeql.yml`) analyzes TypeScript/JavaScript and Android Kotlin on pushes, pull requests, and a weekly schedule.
- **Dependabot** (`.github/dependabot.yml`) monitors pnpm, Gradle, Docker, and GitHub Actions weekly.
- **Release production** (`.github/workflows/release-production.yml`) runs only after a successful `CI` push run on `master`. It publishes one SHA-tagged GHCR image, captures its immutable digest, rejects out-of-order deployment when that revision is no longer the `master` tip, and supplies only `image@sha256:digest` plus the 40-character revision to the host dispatcher. The production job uses a protected GitHub Environment and Tailscale before strict-host-key OpenSSH.

Action dependencies are pinned to full commit SHAs. Workflow permissions are job-scoped, timeouts are bounded, and concurrent PR runs are canceled. Production releases and deployments are never canceled partway through.

## GitHub setup gates

These controls cannot be created by repository files and must be enabled by a repository administrator:

1. Keep the default branch named `master` and protect it. Require pull requests and the four CI job checks: `Node checks`, `Android checks`, `Host operations`, and `Compose integration`. Require CodeQL checks if GitHub code scanning is enabled for the repository plan.
2. Allow GitHub Actions to publish packages, then make the GHCR package public so the host does not need a registry credential. Do not grant package write permission to PR workflows.
3. Create a `production` Environment with required reviewers, prevent self-review when appropriate, and restrict it to `master`.
4. Create a narrowly scoped Tailscale OAuth client/tag. Tailnet ACLs should allow that CI tag to reach only the production host's SSH port.
5. Add Environment configuration (values are intentionally absent from this repository):

   | Type | Name | Purpose |
   | --- | --- | --- |
   | Secret | `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
   | Secret | `TS_OAUTH_SECRET` | Tailscale OAuth secret |
   | Variable | `TS_TAGS` | Approved ephemeral CI node tag(s) |
   | Variable | `PRODUCTION_SSH_HOST` | Tailnet DNS name or address |
   | Variable | `PRODUCTION_SSH_PORT` | SSH port; optional, defaults to 22 |
   | Secret | `PRODUCTION_SSH_PRIVATE_KEY` | Dedicated key for the forced-command `deploy` account |
   | Secret | `PRODUCTION_SSH_HOST_KEYS` | Trusted OpenSSH known-hosts line(s), verified out of band |

The deploy host must be bootstrapped separately as described in [Host operations](HOST-OPERATIONS.md). Enabling the workflow before branch protection, environment review, tailnet ACLs, and host restrictions are verified is not supported.
