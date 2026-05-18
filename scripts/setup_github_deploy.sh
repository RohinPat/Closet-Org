#!/usr/bin/env bash
# One-time server setup for GitHub Actions SSH deploy.
# Run ON THE SERVER as root after the repo exists at /opt/closet-org:
#
#   curl -fsSL https://raw.githubusercontent.com/rohinpat/Closet-Org/main/scripts/setup_github_deploy.sh | sudo bash
#   # or, after git pull:
#   sudo bash /opt/closet-org/scripts/setup_github_deploy.sh
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/closet-org}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_KEY_COMMENT="${DEPLOY_KEY_COMMENT:-github-actions-closet-org}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

git config --global --add safe.directory "${INSTALL_DIR}" 2>/dev/null || true

SUDOERS_FILE="/etc/sudoers.d/closet-org-deploy"
cat >"${SUDOERS_FILE}" <<EOF
# Allow ${DEPLOY_USER} to run production deploy without a password (GitHub Actions)
${DEPLOY_USER} ALL=(ALL) NOPASSWD: ${INSTALL_DIR}/scripts/deploy_prod.sh
EOF
chmod 440 "${SUDOERS_FILE}"
visudo -cf "${SUDOERS_FILE}"

AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
mkdir -p "/home/${DEPLOY_USER}/.ssh"
chmod 700 "/home/${DEPLOY_USER}/.ssh"
touch "${AUTH_KEYS}"
chmod 600 "${AUTH_KEYS}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"

KEY_PATH="/home/${DEPLOY_USER}/.ssh/${DEPLOY_KEY_COMMENT}"
if [[ ! -f "${KEY_PATH}" ]]; then
  sudo -u "${DEPLOY_USER}" ssh-keygen -t ed25519 -N "" -C "${DEPLOY_KEY_COMMENT}" -f "${KEY_PATH}"
  echo ""
  echo "=== Add this public key to GitHub secret DEPLOY_SSH_KEY (private key below) ==="
  echo "=== Private key (paste entire file into GitHub → Settings → Secrets):          ==="
  cat "${KEY_PATH}"
  echo ""
  echo "=== Public key (also appended to authorized_keys on this server):            ==="
  cat "${KEY_PATH}.pub"
  if ! grep -qF "$(cat "${KEY_PATH}.pub")" "${AUTH_KEYS}" 2>/dev/null; then
    cat "${KEY_PATH}.pub" >>"${AUTH_KEYS}"
  fi
else
  echo "Deploy key already exists at ${KEY_PATH}"
  echo "Private key for GitHub Actions:"
  cat "${KEY_PATH}"
fi

chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"

echo ""
echo "Done. Set GitHub repository secrets:"
echo "  DEPLOY_HOST     = your server public IP or hostname"
echo "  DEPLOY_USER     = ${DEPLOY_USER}"
echo "  DEPLOY_SSH_KEY  = contents of ${KEY_PATH} (private key)"
echo ""
echo "Push to main → Actions → Deploy production"
