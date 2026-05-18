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

# ubuntu must write tracked files on pull — do NOT chown uploads/.venv/.cache (breaks the running app)
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${INSTALL_DIR}/.git"
find "${INSTALL_DIR}" -mindepth 1 \
  \( -path "${INSTALL_DIR}/.git" \
    -o -path "${INSTALL_DIR}/uploads" \
    -o -path "${INSTALL_DIR}/.cache" \
    -o -path "${INSTALL_DIR}/.u2net" \
    -o -path "${INSTALL_DIR}/.venv" \) -prune -o \
  -exec chown "${DEPLOY_USER}:${DEPLOY_USER}" {} +

echo "==> Fetch ${GIT_BRANCH}"
sudo -u "${DEPLOY_USER}" git -C "${INSTALL_DIR}" fetch origin "${GIT_BRANCH}"
sudo -u "${DEPLOY_USER}" git -C "${INSTALL_DIR}" checkout "${GIT_BRANCH}"
sudo -u "${DEPLOY_USER}" git -C "${INSTALL_DIR}" pull --ff-only origin "${GIT_BRANCH}"

echo "==> Python dependencies"
if [[ ! -x "${INSTALL_DIR}/.venv/bin/pip" ]]; then
  echo "Missing venv at ${INSTALL_DIR}/.venv — run provision script first."
  exit 1
fi
sudo -u closet-org "${INSTALL_DIR}/.venv/bin/pip" install -q --upgrade pip
sudo -u closet-org "${INSTALL_DIR}/.venv/bin/pip" install -q -r "${INSTALL_DIR}/requirements.txt"
sudo -u closet-org "${INSTALL_DIR}/.venv/bin/pip" install -q onnxruntime rembg 2>/dev/null || true

echo "==> Runtime permissions"
mkdir -p \
  "${INSTALL_DIR}/uploads" \
  "${INSTALL_DIR}/.cache/huggingface" \
  "${INSTALL_DIR}/.cache/torch" \
  "${INSTALL_DIR}/.u2net"
for path in uploads .cache .u2net .venv; do
  chown -R closet-org:closet-org "${INSTALL_DIR}/${path}"
done

BACKEND_DIR="${INSTALL_DIR}/backend"
shopt -s nullglob
for f in "${BACKEND_DIR}"/closet.db*; do
  chown closet-org:closet-org "$f"
done
chgrp closet-org "${BACKEND_DIR}"
chmod 2775 "${BACKEND_DIR}"

echo "==> Restart services"
systemctl restart closet-org
if nginx -t 2>/dev/null; then
  systemctl reload nginx
fi

echo "==> Health checks (retry — app may need a few seconds after restart)"
HEALTH_OK=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  for url in http://127.0.0.1:8000/healthz http://127.0.0.1/healthz; do
    if curl -fsS --max-time 10 "${url}" >/dev/null 2>&1; then
      echo "OK ${url} (attempt ${attempt})"
      HEALTH_OK=1
      break 2
    fi
  done
  sleep 3
done

if [[ "${HEALTH_OK}" -ne 1 ]]; then
  echo "ERROR: API health check failed after restart. Recent logs:"
  journalctl -u closet-org -n 40 --no-pager || true
  systemctl status closet-org --no-pager || true
  exit 1
fi

echo "Deploy finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
