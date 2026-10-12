#!/usr/bin/env bash
# Nightly backup of the Closet-Org database and photos. Run as root.
# Installed as a systemd timer by scripts/deploy_prod.sh (closet-org-backup.timer).
#
#   sudo bash /opt/closet-org/scripts/backup_prod.sh
#
# What it does:
#   1. Consistent online snapshot of the SQLite DB (sqlite3 backup API, safe
#      while the app is running in WAL mode), gzipped.
#   2. Daily snapshot of uploads/ with rsync --link-dest: unchanged photos are
#      hard links, so each extra day costs only the new/changed files.
#   3. Deletes local snapshots older than RETENTION_DAYS.
#   4. Optional off-site copy with rclone when BACKUP_RCLONE_REMOTE is set
#      (e.g. Cloudflare R2 or Backblaze B2). Strongly recommended: a local
#      backup does not survive losing the VM or its disk.
#
# Config (optional) in /etc/closet-org-backup.env:
#   BACKUP_DIR=/var/backups/closet-org
#   RETENTION_DAYS=14
#   BACKUP_RCLONE_REMOTE=r2:closet-org-backups   # an `rclone config` remote:bucket
#
# Restore: see docs/BACKUPS.md.
set -euo pipefail

if [[ -f /etc/closet-org-backup.env ]]; then
  # shellcheck source=/dev/null
  source /etc/closet-org-backup.env
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/closet-org}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/closet-org}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
PYTHON="${INSTALL_DIR}/.venv/bin/python"

# Same resolution order as backend/database/db_manager.py.
DB_PATH="${CLOSET_DB_PATH:-}"
if [[ -z "${DB_PATH}" && -f /etc/closet-org.env ]]; then
  DB_PATH="$(sed -n 's/^CLOSET_DB_PATH=//p' /etc/closet-org.env | tail -n1)"
fi
DB_PATH="${DB_PATH:-${INSTALL_DIR}/backend/closet.db}"
UPLOADS_DIR="${INSTALL_DIR}/uploads"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi
if [[ ! -f "${DB_PATH}" ]]; then
  echo "Database not found at ${DB_PATH}" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "${BACKUP_DIR}/db" "${BACKUP_DIR}/uploads"
chmod 700 "${BACKUP_DIR}"

echo "==> Database snapshot"
DB_OUT="${BACKUP_DIR}/db/closet-${STAMP}.db"
"${PYTHON}" - "${DB_PATH}" "${DB_OUT}" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True, timeout=60)
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
ok = dst.execute("PRAGMA integrity_check").fetchone()[0]
dst.close()
src.close()
if ok != "ok":
    sys.exit(f"integrity_check failed on backup: {ok}")
PY
gzip -9 "${DB_OUT}"
echo "    ${DB_OUT}.gz ($(du -h "${DB_OUT}.gz" | cut -f1))"

echo "==> Photo snapshot"
UPL_OUT="${BACKUP_DIR}/uploads/${STAMP}"
LATEST="$(find "${BACKUP_DIR}/uploads" -mindepth 1 -maxdepth 1 -type d | sort | tail -n1 || true)"
if [[ -n "${LATEST}" ]]; then
  rsync -a --delete --link-dest="${LATEST}" "${UPLOADS_DIR}/" "${UPL_OUT}/"
else
  rsync -a --delete "${UPLOADS_DIR}/" "${UPL_OUT}/"
fi
echo "    ${UPL_OUT} ($(find "${UPL_OUT}" -type f | wc -l) files)"

echo "==> Prune snapshots older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}/db" -name 'closet-*.db.gz' -mtime +"${RETENTION_DAYS}" -print -delete
find "${BACKUP_DIR}/uploads" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" \
  -print -exec rm -rf {} +

if [[ -n "${BACKUP_RCLONE_REMOTE}" ]]; then
  echo "==> Off-site copy to ${BACKUP_RCLONE_REMOTE}"
  # DB snapshots: copy new ones, then mirror local retention.
  rclone copy "${BACKUP_DIR}/db" "${BACKUP_RCLONE_REMOTE}/db"
  rclone delete "${BACKUP_RCLONE_REMOTE}/db" --min-age "${RETENTION_DAYS}d"
  # Photos: mirror the newest snapshot; files deleted locally are kept in a
  # dated folder for RETENTION_DAYS so an accidental delete is recoverable.
  rclone sync "${UPL_OUT}" "${BACKUP_RCLONE_REMOTE}/uploads/current" \
    --backup-dir "${BACKUP_RCLONE_REMOTE}/uploads/deleted-${STAMP}"
  # Moved files keep their original mtime, so prune by the folder's date stamp.
  CUTOFF="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%dT%H%M%SZ)"
  rclone lsf --dirs-only "${BACKUP_RCLONE_REMOTE}/uploads" | sed 's#/$##' \
    | { grep '^deleted-' || true; } | while read -r dir; do
      if [[ "${dir#deleted-}" < "${CUTOFF}" ]]; then
        echo "    purge ${dir}"
        rclone purge "${BACKUP_RCLONE_REMOTE}/uploads/${dir}"
      fi
    done
else
  echo "==> BACKUP_RCLONE_REMOTE not set: backups are on this VM only (see docs/BACKUPS.md)"
fi

echo "Backup finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
