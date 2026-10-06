#!/usr/bin/env bash
# Run locally in an interactive terminal. The private key stays in ~/.ssh.
# Installs only its public key on the existing server account; does not deploy the app.
set -eu

ssh_target="${1:-talinoserver2-ts}"
access_key_path="$HOME/.ssh/dost-caraga-pr-server_ed25519"

if [ ! -t 0 ]; then
  printf 'Run this script directly in your terminal: bash scripts/setup-server-access.sh\n' >&2
  exit 1
fi
if [ -z "${SSH_AUTH_SOCK:-}" ]; then
  printf 'No SSH agent is available. Start your normal SSH agent, then run this script again.\n' >&2
  exit 1
fi
agent_status=0
ssh-add -l >/dev/null 2>&1 || agent_status=$?
# ssh-add exits 1 for an empty agent, 2 when it cannot connect to an agent.
if [ "$agent_status" -ne 0 ] && [ "$agent_status" -ne 1 ]; then
  printf 'Cannot connect to your SSH agent. Run this in your usual terminal session.\n' >&2
  exit 1
fi

mkdir -p "$HOME/.ssh"
if [ -e "$access_key_path" ] && [ ! -f "$access_key_path" ]; then
  printf 'Key path is not a regular file: %s\n' "$access_key_path" >&2
  exit 1
fi
if [ ! -f "$access_key_path" ]; then
  if [ -e "$access_key_path.pub" ]; then
    printf 'Public key already exists without its private key. Resolve that before continuing.\n' >&2
    exit 1
  fi
  printf 'Creating a dedicated local SSH key. Choose a passphrase at the prompt.\n'
  ssh-keygen -t ed25519 -f "$access_key_path" -C 'dost-caraga-pr local server access'
fi

printf '\nLoading the key into your existing SSH agent.\n'
ssh-add "$access_key_path"

# Regenerate only a missing public key, never print the private key.
if [ ! -f "$access_key_path.pub" ]; then
  ssh-keygen -y -f "$access_key_path" > "$access_key_path.pub"
fi

if ! ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o ConnectTimeout=15 -i "$access_key_path" "$ssh_target" true; then
  printf '\nInstalling the public key. Enter your server password if prompted.\n'
  ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=15 "$ssh_target" '
    set -eu
    IFS= read -r access_public_key
    case "$access_public_key" in
      "ssh-ed25519 "*) ;;
      *) printf "Expected an Ed25519 public key.\n" >&2; exit 1 ;;
    esac
    umask 077
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    touch "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
    if ! grep -qxF -- "$access_public_key" "$HOME/.ssh/authorized_keys"; then
      printf "\n%s\n" "$access_public_key" >> "$HOME/.ssh/authorized_keys"
    fi
  ' < "$access_key_path.pub"
fi

printf '\nVerifying SSH key login without a server password.\n'
ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o ConnectTimeout=15 -i "$access_key_path" "$ssh_target" \
  'printf "SSH key login is working.\n"'
printf '\nSetup complete. Tell Codex it is done so server inspection can continue.\n'
printf 'Private key location: %s (do not share its contents)\n' "$access_key_path"
