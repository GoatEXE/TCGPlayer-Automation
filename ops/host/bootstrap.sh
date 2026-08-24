#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat >&2 <<'USAGE'
Usage: sudo ./ops/host/bootstrap.sh --deploy-public-key PATH \
  [--env-file PATH] [--host-config PATH]

Docker Engine with Compose, Tailscale, OpenSSH server, curl, and sudo must be
installed first. This command does not enroll Tailscale or change host firewall
rules; it installs root-owned operations and a forced-command deploy account.
USAGE
}

deploy_key=''
app_env=''
host_config=''
while (($#)); do
  case "$1" in
    --deploy-public-key)
      (($# >= 2)) || { usage; exit 2; }
      deploy_key="$2"
      shift 2
      ;;
    --env-file)
      (($# >= 2)) || { usage; exit 2; }
      app_env="$2"
      shift 2
      ;;
    --host-config)
      (($# >= 2)) || { usage; exit 2; }
      host_config="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

require_root
[[ -n "$deploy_key" && -r "$deploy_key" ]] || die '--deploy-public-key must name a readable public key'
require_command docker
require_command tailscale
require_command ssh-keygen
require_command sshd
require_command sudo
require_command visudo
docker compose version >/dev/null
tailscale status >/dev/null || die 'Tailscale must already be enrolled and connected'

key_line="$(grep -v '^[[:space:]]*$' "$deploy_key")"
[[ "$(grep -cv '^[[:space:]]*$' "$deploy_key")" -eq 1 ]] || die 'provide exactly one SSH public key'
[[ "$key_line" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh.com)[[:space:]] ]] ||
  die 'unsupported or option-prefixed SSH public key'
ssh-keygen -l -f "$deploy_key" >/dev/null

install_args=()
[[ -z "$app_env" ]] || install_args+=(--env-file "$app_env")
[[ -z "$host_config" ]] || install_args+=(--host-config "$host_config")
bash "$SCRIPT_DIR/install.sh" "${install_args[@]}"

if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
fi
usermod --shell /bin/bash deploy
passwd --lock deploy >/dev/null

install -d -o root -g root -m 0755 /home/deploy /home/deploy/.ssh
printf '%s\n' "$key_line" > /home/deploy/.ssh/authorized_keys
chown root:root /home/deploy/.ssh/authorized_keys
chmod 0644 /home/deploy/.ssh/authorized_keys

sudoers_file=/etc/sudoers.d/tcgplayer-automation-deploy
cat > "$sudoers_file" <<EOF
# The forced SSH dispatcher and root wrapper validate one exact master revision.
deploy ALL=(root) NOPASSWD: $DEFAULT_LIBEXEC_DIR/deploy *
EOF
chown root:root "$sudoers_file"
chmod 0440 "$sudoers_file"
visudo -cf "$sudoers_file" >/dev/null

sshd_file=/etc/ssh/sshd_config.d/90-tcgplayer-automation-deploy.conf
cat > "$sshd_file" <<EOF
Match User deploy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    DisableForwarding yes
    X11Forwarding no
    ForceCommand $DEFAULT_LIBEXEC_DIR/dispatch
EOF
chown root:root "$sshd_file"
chmod 0644 "$sshd_file"
sshd -t
systemctl reload ssh

log 'bootstrap complete; deploy is restricted to the validated forced command'
log 'review host firewall and tailnet ACLs before enabling the GitHub production environment'
