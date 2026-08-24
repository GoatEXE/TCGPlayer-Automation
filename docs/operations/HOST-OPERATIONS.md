# Production host operations

These files are a scaffold for an operator-controlled Ubuntu host. Repository automation does not connect to, bootstrap, or otherwise mutate the server by itself.

## Design and invariants

- Docker Compose always uses project name `tcgplayer-automation`.
- Existing production data remains in `tcgplayer-automation_pgdata` and `tcgplayer-automation_redisdata`. Production operations never run `docker compose down -v`.
- `/opt/tcgplayer-automation` contains the root-owned Compose definition, `/etc/tcgplayer-automation` contains root-owned configuration, `/var/lib/tcgplayer-automation` contains release state/backups, and `/usr/local/libexec/tcgplayer-automation` contains root-owned commands.
- The app is published directly to a configurable host port for LAN use. There is no public ingress or reverse proxy. Host firewall rules must restrict that port to the intended LAN/tailnet; `APP_BIND_ADDRESS=0.0.0.0` alone is not a firewall policy.
- GitHub reaches SSH through Tailscale. OpenSSH forces user `deploy` through a validator that accepts only `deploy IMAGE@sha256:DIGEST REVISION`; the restricted account can sudo only the root-owned deploy command.
- Deployments pull by digest, verify the image revision label, start PostgreSQL/Redis, take a pre-deploy PostgreSQL backup, run the one-shot migration container, replace the app, and wait for `/ready` before advancing release state.

## Prerequisites

Install supported Docker Engine + Compose v2, Tailscale, OpenSSH server, `curl`, and `sudo` using their vendor/Ubuntu guidance. Enroll the host in the tailnet and establish firewall/tailnet ACLs before bootstrap. Do not expose the application or SSH broadly to the internet.

Prepare both configuration files outside the repository:

```bash
cp ops/host/config/app.env.example /secure/operator/path/app.env
cp ops/host/config/host.conf.example /secure/operator/path/host.conf
# Replace every placeholder; use a long random PostgreSQL password.
# Set GHCR_IMAGE_REPOSITORY to the lowercase package path.
```

The populated files can contain secrets and must never be committed. Keep the GHCR package public when possible; otherwise registry login is a separate root-owned host concern and credentials must not be passed by the deploy workflow.

Create a dedicated SSH key, retain its private half only in the protected GitHub `production` Environment, and verify the host public-key fingerprint through a trusted console. Then, from a reviewed repository checkout on the host, run:

```bash
sudo ./ops/host/bootstrap.sh \
  --deploy-public-key /secure/operator/path/deploy.pub \
  --env-file /secure/operator/path/app.env \
  --host-config /secure/operator/path/host.conf
```

Bootstrap validates installed prerequisites and Tailscale state, installs files, creates/locks the `deploy` password, installs the public key, validates the sudoers fragment and `sshd` configuration, then reloads SSH. It does not enroll Tailscale or alter firewall rules. Keep an independent root/console recovery path and test it before ending the bootstrap session.

To update only repository-owned scripts/Compose later, run `sudo ./ops/host/install.sh` from the reviewed checkout. Pass `--env-file` or `--host-config` only when intentionally replacing those root-owned files. Install does not start or replace containers.

## Root/operator commands

Installed commands are intentionally not on the restricted deploy account's general command path:

```bash
sudo /usr/local/libexec/tcgplayer-automation/status
sudo /usr/local/libexec/tcgplayer-automation/logs app 200
sudo /usr/local/libexec/tcgplayer-automation/logs db 200
sudo /usr/local/libexec/tcgplayer-automation/backup
sudo /usr/local/libexec/tcgplayer-automation/smoke
sudo /usr/local/libexec/tcgplayer-automation/rollback
```

`logs` accepts only `app`, `db`, or `redis`. `backup` writes a PostgreSQL custom-format dump, release metadata, and checksum under the mode-0700 backup directory, then applies configured retention. Backups contain business data: copy them to protected storage, encrypt them at rest, and periodically test `pg_restore` on an isolated instance. Redis persists scheduler/queue state in its named volume but is not included in the logical PostgreSQL backup; use a separately reviewed stopped-volume backup if queue-state recovery is required.

Rollback swaps to the previously recorded digest without reversing database migrations. Each release must therefore preserve one-release backward schema compatibility. It takes another database backup and restores the current app automatically if the previous image fails readiness.

## First release and normal dispatch

The first deployment also backs up PostgreSQL before migration; its sidecar metadata marks the dump `pre-adoption` because no managed release was recorded yet. Normal deployments are dispatched only by the protected GitHub Environment. For break-glass root use, the same validated command is available locally:

```bash
sudo /usr/local/libexec/tcgplayer-automation/deploy \
  ghcr.io/owner/repository@sha256:<64-lowercase-hex> \
  <40-lowercase-hex-revision>
```

Do not use mutable tags (`latest`, branch tags, or SHA tags) as deploy input. Do not use `docker compose down -v` in production. A failed deploy leaves recorded current/previous release state unchanged and attempts to restore the former app image; migrations are not automatically reversed.
