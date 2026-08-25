# Production host operations

This document is the operator source of truth for the Ubuntu production host.
It separates a **fresh host** from a **current host** being moved from the prior
release mechanism. Repository workflows do not bootstrap the server; after the
one-time cutover in [CI/CD](CI-CD.md), they can request only an exact protected
`master` revision through the restricted SSH boundary.

## Host trust boundary and release invariants

- Docker Compose always uses project name `tcgplayer-automation`. Preserve the
  named production volumes `tcgplayer-automation_pgdata` and
  `tcgplayer-automation_redisdata`; never use `docker compose down -v` in
  production.
- `/opt/tcgplayer-automation` is a root-owned checkout of the configured public
  repository. `/etc/tcgplayer-automation` holds root-owned external
  configuration, `/var/lib/tcgplayer-automation` holds root-owned release state
  and backups, and `/usr/local/libexec/tcgplayer-automation` holds the stable
  root-owned SSH and operator boundary.
- The production endpoint defaults to host port **3001** in
  `ops/host/config/app.env.example`. It is LAN/tailnet only; firewall and
  tailnet policy must restrict it. `APP_BIND_ADDRESS=0.0.0.0` is not a firewall
  rule.
- Runtime containers are non-root, read-only, capability-dropped, and use
  `no-new-privileges`. Runtime secrets remain in the root-owned external
  environment file, never in the checkout.
- The SSH `deploy` account has a forced command. It accepts only
  `deploy <40-lowercase-hex-SHA>`, has no interactive shell/TTY/forwarding path,
  and can sudo only the root-owned deploy wrapper. It cannot submit an image,
  digest, branch, tag, or arbitrary command.
- Before a checkout changes, the stable wrapper requires the configured public
  origin, no local checkout drift, a requested SHA equal to current
  `origin/master`, and a fetched ref equal to that SHA. It then detached-checks
  out that revision and invokes that revision's release implementation.
- Every release builds a local, immutable-by-name image
  `tcgplayer-automation:revision-<40-character-SHA>`. It verifies the image's
  OCI revision label and uses the revision's own Dockerfile and Compose file.
  No release pulls or publishes a production image.

## Fresh host: first install

Use this path for a host with no prior managed release. Keep the GitHub
`production` required-reviewer rule in place through the first successful
release and preflight.

### 1. Establish host prerequisites outside this repository

Install supported Docker Engine with Compose v2, Git, Tailscale, OpenSSH
server, `curl`, and `sudo` using Ubuntu/vendor guidance. Enroll and connect
Tailscale before bootstrap. Configure firewall and tailnet ACLs so the scoped
CI node can reach only the production SSH port; do not expose SSH or the app to
the public internet. Retain an independent root/console recovery path and test
it before changing SSH configuration.

Create a dedicated deployment SSH key. Keep its private half only in the
GitHub `production` Environment and verify the host public-key fingerprint by a
trusted console before adding it to `PRODUCTION_SSH_HOST_KEYS`.

### 2. Create external host configuration

From a reviewed repository checkout, copy the templates to a secure location
outside the repository:

```bash
cp ops/host/config/app.env.example /secure/operator/path/app.env
cp ops/host/config/host.conf.example /secure/operator/path/host.conf
# Replace every placeholder. Use a long random PostgreSQL password.
# Keep REPOSITORY_URL pointed at the reviewed public GitHub repository.
```

`app.env` may contain secrets and must never be committed. `host.conf` is
non-secret operational configuration and must retain `REPOSITORY_URL` and a
numeric `BACKUP_RETENTION_DAYS`. The host fetches public source and builds it
locally, so no registry credential belongs in either file.

### 3. Bootstrap once

Run this as root from the reviewed checkout:

```bash
sudo ./ops/host/bootstrap.sh \
  --deploy-public-key /secure/operator/path/deploy.pub \
  --env-file /secure/operator/path/app.env \
  --host-config /secure/operator/path/host.conf
```

Bootstrap validates Docker/Compose, connected Tailscale, OpenSSH, `sudo`, and
the supplied public key. It creates or validates the root checkout, installs
stable wrappers, creates and locks `deploy`, installs the public key, writes
and validates the restricted sudoers and SSH Match configuration, and reloads
SSH. It does **not** enroll Tailscale or alter firewall rules.

The initial install validates Compose configuration but does not start or
replace containers. A fresh host has no recorded release, backup, or healthy
app yet, so `status` and full preflight are expected to fail until the first
approved deployment completes.

### 4. Prove the first release before cutover

Approve one protected production deployment using the Environment reviewer.
After it succeeds, run the installed preflight as root, inspect release status
and loopback readiness, and resolve every failure before removing GitHub's
reviewer rule:

```bash
sudo /usr/local/libexec/tcgplayer-automation/preflight
sudo /usr/local/libexec/tcgplayer-automation/status
curl --fail http://127.0.0.1:3001/ready
```

If the application has a documented non-default `APP_HOST_PORT`, use that port
for the last command. Continue with the GitHub audit and typed cutover command
in [CI/CD](CI-CD.md#one-time-automatic-deployment-cutover) only after this
host acceptance succeeds.

## Current host: transition from the prior release mechanism

Use a maintenance window for an existing production host. These steps retain
the current volumes and keep the reviewer gate until the server-build path is
proven.

1. Take and retain an independent database backup, and back up the existing
   external app environment and host configuration. Do not remove the named
   volumes or run `docker compose down -v`.
2. Create an updated external `host.conf` using the current example. Preserve
   `REPOSITORY_URL` and `BACKUP_RETENTION_DAYS`, remove the retired
   registry-related setting, and set `APP_HOST_PORT=3001` in external `app.env`
   unless a different LAN port is explicitly documented.
3. From a reviewed checkout containing these host scripts, refresh/install the
   trusted boundary. Supplying both external files is valid for a transition:

   ```bash
   sudo ./ops/host/install.sh \
     --env-file /secure/operator/path/app.env \
     --host-config /secure/operator/path/host.conf
   ```

   The installer creates or validates the root-owned public checkout and
   installs stable wrappers. It validates Compose but does not start, replace,
   or stop containers.
4. Inspect the existing state without deleting old records or pruning retained
   images:

   ```bash
   sudo /usr/local/libexec/tcgplayer-automation/status
   ```

   `status` accepts only current deterministic local release metadata, so it is
   expected to reject an old digest-format record before adoption. Treat that
   rejection as a reason to preserve—not delete—the old records and their local
   images for the first approved deployment.
5. Approve one protected deployment. One-time legacy adoption is permitted only
   for the prior project-owned digest record format with a 40-character
   revision. Before changing state, the host verifies every referenced image is
   already local with the matching OCI revision label and validates ancestry.
   It archives original records in a mode-0700
   `legacy-release-adoption.*` directory under the state directory, retags the
   local images with deterministic local names, and writes local metadata. It
   never contacts a registry. Missing images, wrong labels, mixed records, or
   arbitrary state fail closed without changing release files.
6. Verify the action log, local image/revision shown by `status`, archived
   adoption records when applicable, a valid backup, and `/ready`. Then run the
   installed read-only preflight. Resolve all failures before the GitHub
   automatic-deployment cutover.

## Stable root-wrapper exception and maintenance

Normal application code, Dockerfile, migrations, `docker-compose.yml`, and
versioned `release.sh` changes deploy automatically from the reviewed exact
SHA. They are loaded from `/opt/tcgplayer-automation` only after the stable
root wrapper validates that SHA.

That rule has an intentional exception: the files under
`/usr/local/libexec/tcgplayer-automation` are the root/SSH trust boundary and
are **not** updated by a deployment. `install.sh` copies `lib/common.sh` plus
`status`, `logs`, `backup`, `deploy`, `rollback`, `smoke`, `preflight`, and
`dispatch` there with root ownership and fixed modes. A change to any of those
files requires a scheduled root-maintenance refresh:

```bash
sudo ./ops/host/install.sh
```

Run that command from the reviewed checkout containing the wrapper version to
install. On an existing host its external config files are retained, so the two
arguments are optional; provide them when intentionally replacing config. The
installer validates the existing managed checkout but does not fetch or update
an existing `/opt` checkout on its own.

Treat a stable-wrapper change as a special production maintenance event. If
production must be paused, manually restore a required reviewer in the GitHub
Environment first; install the reviewed boundary; deploy the protected change
once through that gate; then run preflight to prove wrapper parity. If the
reviewer gate was restored, repeat the GitHub audit and typed cutover process
to resume automatic deployments. `bootstrap.sh` is for initial setup, deploy
key rotation, or SSH/sudo repair—not routine application releases.

## Read-only preflight and routine inspection

Run preflight after the first release, after a current-host transition, and
after root-wrapper maintenance:

```bash
sudo /usr/local/libexec/tcgplayer-automation/preflight
```

It is read-only: it does not fetch Git, check out source, build images, start
or stop Compose services, create backups, or change host/GitHub configuration.
It audits:

- managed public checkout identity, no local drift, and exact recorded SHA;
- stable-wrapper byte parity, modes, and (when run as root) ownership;
- deterministic current/previous release metadata and matching OCI labels;
- running `db`, `redis`, and `app` health, app image/revision provenance, and
  loopback `/ready`;
- latest PostgreSQL backup checksum and four-line release metadata;
- required named volumes and absence of active retired registry configuration;
- the `deploy` SSH Match directives, forced dispatcher, sudo restriction,
  `visudo`, and `sshd` syntax.

Run it with `sudo` for ownership and restricted-file checks. A non-root run may
report a limited pass but is not the full host audit. A failed preflight makes
no repair; fix the reported condition through controlled host maintenance.

Other installed root/operator commands are intentionally outside the restricted
deploy account's general command path:

```bash
sudo /usr/local/libexec/tcgplayer-automation/status
sudo /usr/local/libexec/tcgplayer-automation/logs app 200
sudo /usr/local/libexec/tcgplayer-automation/logs db 200
sudo /usr/local/libexec/tcgplayer-automation/logs redis 200
sudo /usr/local/libexec/tcgplayer-automation/backup
sudo /usr/local/libexec/tcgplayer-automation/smoke
```

`logs` accepts only `app`, `db`, or `redis`. `status` checks that the checkout
matches recorded release state before using its Compose file. Do not repair a
mismatch by editing release-state files.

## Deployment failure restoration

The target release order is: local image build and label check; data-service
health; pre-deploy PostgreSQL backup; one-shot migration; app replacement;
`/ready`; and only then target release-state advancement. If a failure occurs
after a target checkout has been selected and a valid current release exists,
the stable and versioned finalizers attempt to restore the recorded checkout
and current image/app.

One exception precedes target readiness: a **successful** one-time legacy
adoption archives the valid legacy records and rewrites them as deterministic
local current/previous metadata before the target build. If that later target
deployment fails, the target is not advanced, but the adoption archive and
rewritten adopted metadata remain; recovery restores the adopted recorded
current app. Invalid, mixed, or unverified legacy records fail closed without
changing adoption metadata or release files.

This is best-effort application recovery. It cannot reverse a migration or
restore database contents automatically. If restoration also fails, preserve
logs and release-state files, use the independent root/console path, and follow
the manual rollback/DR process rather than deleting volumes or editing state.
A first deployment has no recorded predecessor to restore.

## Manual rollback

Use rollback for a ready, recorded previous application release:

```bash
sudo /usr/local/libexec/tcgplayer-automation/rollback
```

It takes a pre-rollback PostgreSQL backup using the current release's Compose
file, selects the recorded previous exact revision, rebuilds its local image if
it was pruned (only after confirming that revision remains reachable from
`origin/master`), starts it, and checks readiness. On success it swaps current
and previous release metadata. If readiness fails, it attempts to restore the
former current app and leaves release state unchanged.

Do not use the deploy wrapper to select an older SHA; it deliberately accepts
only current `origin/master`. Database migrations are not reversed. Releases
must retain one-release schema compatibility, and a database restore is a
separate deliberate recovery decision.

## Backups and disaster-recovery limits

`backup` and each deployment/rollback pre-backup create a PostgreSQL
custom-format dump, a release metadata file, and a SHA-256 checksum under the
mode-0700 backup directory. Retention removes old local backup artifacts using
`BACKUP_RETENTION_DAYS`.

Those backups are not sufficient disaster recovery by themselves:

- They live on the same host unless an operator copies them elsewhere. Copy
  them to protected, encrypted storage and retain the matching metadata and
  checksum.
- A checksum proves file integrity, not that a restore works. Periodically test
  `pg_restore` to an isolated PostgreSQL instance and document the recovery
  time and credentials procedure.
- The logical PostgreSQL dump does not include Redis queue/scheduler state.
  Use a separately reviewed stopped-volume backup if that state is required.
- Neither automatic failure restoration nor `rollback` restores PostgreSQL;
  migrations are not reversed. Decide explicitly whether to restore a tested
  backup after assessing data loss and schema compatibility.
- Named volumes are intentionally preserved. Do not treat deleting volumes or
  running `docker compose down -v` as a recovery procedure.
