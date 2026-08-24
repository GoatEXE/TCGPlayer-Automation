# Production host operations

These files are an operator-controlled Ubuntu host scaffold. Repository
workflows do not bootstrap, mutate, or otherwise access the server until the
protected production deployment job is explicitly approved.

## Design and invariants

- Docker Compose always uses project name `tcgplayer-automation`.
- Existing production data remains in `tcgplayer-automation_pgdata` and
  `tcgplayer-automation_redisdata`. Production operations never run
  `docker compose down -v`.
- `/opt/tcgplayer-automation` is a root-owned public Git checkout,
  `/etc/tcgplayer-automation` holds root-owned configuration,
  `/var/lib/tcgplayer-automation` holds release state/backups, and
  `/usr/local/libexec/tcgplayer-automation` holds the small root-owned SSH
  boundary and operator wrappers.
- The managed production endpoint remains host port **3001** by default in
  `ops/host/config/app.env.example`. It is LAN/tailnet only: host firewall
  rules must restrict it to the intended networks. `APP_BIND_ADDRESS=0.0.0.0`
  is not a firewall policy.
- Runtime containers stay non-root, read-only, capability-dropped, and
  `no-new-privileges`; production settings remain in the root-owned external
  environment file rather than the checkout.
- GitHub reaches SSH through Tailscale. OpenSSH forces user `deploy` through a
  validator that accepts only `deploy REVISION`, where `REVISION` is exactly
  40 lowercase hexadecimal characters. The restricted account can sudo only
  the root-owned deploy wrapper.
- The wrapper verifies a clean checkout and the configured public repository,
  reads `origin/master` without changing the checkout, and rejects anything
  except the exact current master revision. Only then does it fetch, detached
  checkout that revision, and invoke `ops/host/release.sh` from the revision.
- The versioned release builds
  `tcgplayer-automation:revision-<40-character-sha>` locally, waits for
  PostgreSQL and Redis, creates a PostgreSQL backup, runs migrations from that
  image, replaces the app, verifies `/ready`, then advances release state.
  The revision's own `docker-compose.yml` is used throughout, so Compose
  changes deploy with the reviewed commit. On any unsuccessful deployment with
  recorded state, the host returns the checkout and app to that recorded
  revision before control returns; status, logs, and recorded backups refuse a
  mismatched checkout rather than combining old metadata with new Compose.
  Release files change only after a ready deployment.

## Prerequisites

Install supported Docker Engine + Compose v2, Git, Tailscale, OpenSSH server,
`curl`, and `sudo` using vendor/Ubuntu guidance. Enroll the host in the
tailnet and establish firewall/tailnet ACLs before bootstrap. Do not expose the
application or SSH broadly to the internet.

Prepare both configuration files outside the repository:

```bash
cp ops/host/config/app.env.example /secure/operator/path/app.env
cp ops/host/config/host.conf.example /secure/operator/path/host.conf
# Replace every placeholder; use a long random PostgreSQL password.
# Keep REPOSITORY_URL pointed at the reviewed public repository.
```

The populated environment file can contain secrets and must never be committed.
The host fetches the public source and builds it locally, so no image registry
credential is configured or passed through deployment.

Create a dedicated SSH key, retain its private half only in the protected
GitHub `production` Environment, and verify the host public-key fingerprint
through a trusted console. Then, from a reviewed checkout after these host
scripts have reached `master`, run:

```bash
sudo ./ops/host/bootstrap.sh \
  --deploy-public-key /secure/operator/path/deploy.pub \
  --env-file /secure/operator/path/app.env \
  --host-config /secure/operator/path/host.conf
```

Bootstrap validates installed prerequisites and Tailscale state, creates the
root-owned repository checkout, installs stable wrappers, creates/locks the
`deploy` password, installs the public key, validates the sudoers fragment and
`sshd` configuration, then reloads SSH. It does not enroll Tailscale or alter
firewall rules. Keep an independent root/console recovery path and test it
before ending the bootstrap session.

## Host transition from the prior release mechanism

Do this in a maintenance window before approving the first server-build
release. These steps preserve data volumes and do not change running
containers until an approved deployment:

1. Confirm `master` contains this server-build flow and that the production
   Environment, branch protection, Tailscale ACL, SSH key, and host key values
   described in [CI/CD](CI-CD.md) are present.
2. Back up the existing external app environment and host configuration. Create
   a new `host.conf` from the current example with `REPOSITORY_URL` and retain
   `BACKUP_RETENTION_DAYS`; remove the old image-repository setting. Ensure
   `APP_HOST_PORT=3001` in the external `app.env` unless the operator has an
   explicitly documented alternate LAN port.
3. From the reviewed checkout, run `sudo ./ops/host/install.sh` with both
   configuration files. It creates or validates the root-owned public checkout
   and installs the stable forced-command dispatcher/wrapper. It validates the
   checkout's Compose file but does not start or replace containers.
4. Inspect `sudo /usr/local/libexec/tcgplayer-automation/status` and retain an
   independent database backup. Do **not** run `docker compose down -v` and do
   not remove the named volumes. If `current-release`/`previous-release` still
   contain the old digest records, do not delete those files or prune their
   locally retained images before the first approved deployment.
5. Approve one protected production deployment. Before it builds the target,
   the release performs its one-time adoption only when every legacy record is
   exactly the prior project format: the repository-derived
   `ghcr.io/<lowercase-owner>/<lowercase-repository>@sha256:<64-lowercase-hex>`
   value plus a 40-character revision. It verifies that each referenced image
   is already local and has the matching revision label, verifies revision
   ancestry, copies the original files to a mode-0700
   `legacy-release-adoption.*` directory under the state directory, then tags
   that local image as `tcgplayer-automation:revision-<sha>` and writes local
   metadata. It never pulls from GHCR. Missing images, wrong labels, mixed,
   corrupt, or arbitrary state fail closed without changing release files.
   Verify the action log, the local image tag in `status`, the archive, and
   `http://127.0.0.1:3001/ready` from the host.

The stable files under `/usr/local/libexec/tcgplayer-automation` are the SSH
trust boundary. Re-run `sudo ./ops/host/install.sh` after changes to
`ops/host/bootstrap.sh`, `install.sh`, `dispatch.sh`, `deploy.sh`, or
`ops/host/lib/common.sh` (and after changes to installed operator wrappers).
Normal application, Dockerfile, migration, Compose, backup implementation, or
`release.sh` changes do **not** require an installed Compose copy: the next
approved revision uses those versioned files automatically. Bootstrap itself
must be rerun only when intentionally rotating the deploy public key or
repairing the OpenSSH/sudo setup.

## Root/operator commands

Installed commands are intentionally not on the restricted deploy account's
general command path:

```bash
sudo /usr/local/libexec/tcgplayer-automation/status
sudo /usr/local/libexec/tcgplayer-automation/logs app 200
sudo /usr/local/libexec/tcgplayer-automation/logs db 200
sudo /usr/local/libexec/tcgplayer-automation/backup
sudo /usr/local/libexec/tcgplayer-automation/smoke
sudo /usr/local/libexec/tcgplayer-automation/rollback
```

`logs` accepts only `app`, `db`, or `redis`. `backup` writes a PostgreSQL
custom-format dump, release metadata, and checksum under the mode-0700 backup
directory, then applies configured retention. Backups contain business data:
copy them to protected storage, encrypt them at rest, and periodically test
`pg_restore` on an isolated instance. Redis persists scheduler/queue state in
its named volume but is not included in the logical PostgreSQL backup; use a
separately reviewed stopped-volume backup if queue-state recovery is required.

For break-glass root use, use the same restricted wrapper and exact revision
shape as CI:

```bash
sudo /usr/local/libexec/tcgplayer-automation/deploy \
  <40-lowercase-hex-master-revision>
```

It still verifies the current public `origin/master`, so it cannot deploy an
old SHA or a branch/tag. Do not use a mutable image tag as an input; deployment
has no image input. A host with no recorded release gets a `pre-adoption`
backup; an adopted legacy host uses the recorded old revision's Compose file
for its pre-deploy backup. Do not use `docker compose down -v` in production.

## Rollback

Rollback takes a pre-rollback database backup, changes the root-owned checkout
to the previously recorded revision, and starts that revision's Compose/app
with its deterministic local image tag. If Docker's local image was pruned,
the host safely rebuilds it from the recorded revision after confirming it is
reachable from `origin/master`. If readiness fails, it checks out/rebuilds the
former current release and restores it; release state changes only after a
ready rollback.

Database migrations are not reversed. Every release must preserve one-release
backward schema compatibility. A failed deployment similarly keeps recorded
current/previous state unchanged and attempts to restore the former app.
