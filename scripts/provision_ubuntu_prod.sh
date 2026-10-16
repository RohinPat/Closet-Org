#!/usr/bin/env bash
# Provision Closet-Org on Ubuntu 22.04/24.04 (x86_64 or aarch64).
# Run ON THE SERVER: sudo bash scripts/provision_ubuntu_prod.sh
# or let scripts/cloud-init.yaml run it on first boot (no SSH needed).
#
# Required env:
#   CLOSET_REPO_URL   Git clone URL (e.g. https://github.com/YOU/Closet-Org.git)
#
# Optional:
#   PUBLIC_HOSTNAME   Domain nginx answers for (set DNS first for HTTPS). Unset =
#                     serve on the server's IP over HTTP (TLS skipped).
#   DEPLOY_USER       Owner of the git checkout (default ubuntu; created if missing)
#   SKIP_FIRST_DEPLOY=1  Don't run deploy_prod.sh at the end
#   CERTBOT_EMAIL     If set (and SKIP_TLS unset), runs non-interactive certbot --nginx
#   SKIP_TLS=1        Only HTTP on port 80 (no Let's Encrypt); use for testing or IP-only
#   CLOSET_SECRET_KEY If unset, a random key is generated and written to /etc/closet-org.env
#   INSTALL_DIR       Default /opt/closet-org
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/closet-org}"
CLOSET_REPO_URL="${CLOSET_REPO_URL:?Export CLOSET_REPO_URL=... (git URL)}"
PUBLIC_HOSTNAME="${PUBLIC_HOSTNAME:-_}"
SKIP_TLS="${SKIP_TLS:-0}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
if [[ "${PUBLIC_HOSTNAME}" == "_" ]]; then
  SKIP_TLS=1  # no domain: nginx catch-all on the IP, HTTP only
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

ORIGIN="https://${PUBLIC_HOSTNAME}"
if [[ "${SKIP_TLS}" == "1" ]]; then
  ORIGIN="http://${PUBLIC_HOSTNAME}"
fi
if [[ "${PUBLIC_HOSTNAME}" == "_" ]]; then
  PUBLIC_IP="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || true)"
  ORIGIN="http://${PUBLIC_IP:-localhost}"
fi

ALLOW_LIST="${CLOSET_ALLOWED_ORIGINS:-${ORIGIN}}"
if [[ -z "${CLOSET_SECRET_KEY:-}" ]]; then
  CLOSET_SECRET_KEY="$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  git python3 python3-venv python3-pip build-essential \
  nginx certbot python3-certbot-nginx \
  tesseract-ocr \
  libgl1 libglib2.0-0

# Oracle's Ubuntu image has an "ubuntu" user; other providers may log in as root.
if ! id -u "${DEPLOY_USER}" &>/dev/null; then
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
fi

# Oracle's Ubuntu image ships iptables rules that drop web traffic.
if command -v iptables >/dev/null && ! iptables -C INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null; then
  iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save || true; fi
fi

if ! id -u closet-org &>/dev/null; then
  useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin closet-org
fi

mkdir -p "${INSTALL_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${INSTALL_DIR}"

if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  sudo -u "${DEPLOY_USER}" git clone "${CLOSET_REPO_URL}" "${INSTALL_DIR}" || {
    echo "Clone failed. For a private repo use SSH URL or a token in HTTPS URL."
    exit 1
  }
else
  sudo -u "${DEPLOY_USER}" git -C "${INSTALL_DIR}" pull --ff-only || true
fi

python3 -m venv "${INSTALL_DIR}/.venv"
# shellcheck source=/dev/null
source "${INSTALL_DIR}/.venv/bin/activate"
pip install --upgrade pip
pip install -r "${INSTALL_DIR}/requirements.txt"
# rembg + CPU onnxruntime (no GPU wheels on typical ARM VPS)
pip install onnxruntime rembg || pip install rembg || true
deactivate

mkdir -p "${INSTALL_DIR}/uploads" "${INSTALL_DIR}/.cache/huggingface" "${INSTALL_DIR}/.cache/torch"
chown -R closet-org:closet-org "${INSTALL_DIR}"

cat >/etc/closet-org.env <<EOF
CLOSET_ENV=production
CLOSET_SECRET_KEY=${CLOSET_SECRET_KEY}
ALLOWED_ORIGINS=${ALLOW_LIST}
TRUST_PROXY_HEADERS=1
UVICORN_RELOAD=0
HOST=127.0.0.1
PORT=8000
HF_HOME=${INSTALL_DIR}/.cache/huggingface
TORCH_HOME=${INSTALL_DIR}/.cache/torch
XDG_CACHE_HOME=${INSTALL_DIR}/.cache
EOF
chmod 600 /etc/closet-org.env
chown root:root /etc/closet-org.env

cat >/etc/systemd/system/closet-org.service <<'UNIT'
[Unit]
Description=Closet-Org FastAPI (uvicorn)
After=network.target

[Service]
User=closet-org
Group=closet-org
WorkingDirectory=/opt/closet-org/backend
EnvironmentFile=/etc/closet-org.env
ExecStart=/opt/closet-org/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sed -i "s|/opt/closet-org|${INSTALL_DIR}|g" /etc/systemd/system/closet-org.service

systemctl daemon-reload
systemctl enable --now closet-org

cat >/etc/nginx/sites-available/closet-org <<NGX
server {
    listen 80;
    server_name ${PUBLIC_HOSTNAME};

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 25m;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        send_timeout 600s;
    }
}
NGX

ln -sf /etc/nginx/sites-available/closet-org /etc/nginx/sites-enabled/closet-org
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [[ "${SKIP_TLS}" != "1" && -n "${CERTBOT_EMAIL:-}" ]]; then
  certbot --nginx -d "${PUBLIC_HOSTNAME}" --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" --redirect
  systemctl restart closet-org
else
  echo ""
  echo "=== HTTP is up. For HTTPS, DNS must point to this server, then run:"
  echo "sudo certbot --nginx -d ${PUBLIC_HOSTNAME}"
  echo "Or re-run with CERTBOT_EMAIL=you@domain.com (and SKIP_TLS unset)."
  echo ""
fi

if [[ "${SKIP_FIRST_DEPLOY:-0}" != "1" ]]; then
  # Installs the backup and pull-deploy timers, backfills, health-checks.
  export DEPLOY_USER INSTALL_DIR
  bash "${INSTALL_DIR}/scripts/deploy_prod.sh"
fi

echo "Done. Check: systemctl status closet-org"
echo "Secret key is in /etc/closet-org.env (backup off-box; do not commit)."
echo "Mobile EXPO_PUBLIC_API_URL should be: ${ORIGIN}"
