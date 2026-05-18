#!/usr/bin/env bash
# Production deploy on the Oracle/Ubuntu host. Run as root (GitHub Actions uses sudo).
#
#   sudo bash /opt/closet-org/scripts/deploy_prod.sh
#
# Optional env:
#   INSTALL_DIR   default /opt/closet-org
#   DEPLOY_USER   git user (default ubuntu)
#   GIT_BRANCH    default main
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/closet-org}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
GIT_BRANCH="${GIT_BRANCH:-main}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  echo "No git repo at ${INSTALL_DIR}. Clone first (see scripts/provision_ubuntu_prod.sh)."
  exit 1
fi

git config --global --add safe.directory "${INSTALL_DIR}" 2>/dev/null || true

# ubuntu owns the repo tree so git pull can update tracked files (do not chown whole tree to closet-org)
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${INSTALL_DIR}"

echo "==> Fetch ${GIT_BRANCH}"
sudo -u "${DEPLOY_USER}" git -C "${INSTALL_DIR}" fetch origin "${GIT_BRANCH}"
sudo -u "${DEPLOY_USER}" git -C "${INSTALL_DIR}" checkout "${GIT_BRANCH}"
sudo -u "${DEPLOY_USER}" git -C "${INSTALL_DIR}" pull --ff-only origin "${GIT_BRANCH}"

echo "==> Python dependencies"
if [[ ! -x "${INSTALL_DIR}/.venv/bin/pip" ]]; then
  echo "Missing venv at ${INSTALL_DIR}/.venv — run provision script first."
  exit 1
fi
"${INSTALL_DIR}/.venv/bin/pip" install -q --upgrade pip
"${INSTALL_DIR}/.venv/bin/pip" install -q -r "${INSTALL_DIR}/requirements.txt"
"${INSTALL_DIR}/.venv/bin/pip" install -q onnxruntime rembg 2>/dev/null || true

echo "==> Runtime permissions (writable paths only — keeps git pull working)"
mkdir -p \
  "${INSTALL_DIR}/uploads" \
  "${INSTALL_DIR}/.cache/huggingface" \
  "${INSTALL_DIR}/.cache/torch" \
  "${INSTALL_DIR}/.u2net"
for path in uploads .cache .u2net .venv; do
  chown -R closet-org:closet-org "${INSTALL_DIR}/${path}"
done
if [[ -f "${INSTALL_DIR}/backend/closet.db" ]]; then
  chown closet-org:closet-org "${INSTALL_DIR}/backend/closet.db"
fi

echo "==> Restart services"
systemctl restart closet-org
if nginx -t 2>/dev/null; then
  systemctl reload nginx
fi

echo "==> Health checks"
for url in http://127.0.0.1:8000/healthz http://127.0.0.1/healthz; do
  if curl -fsS --max-time 15 "${url}" >/dev/null; then
    echo "OK ${url}"
    break
  fi
done

echo "Deploy finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
