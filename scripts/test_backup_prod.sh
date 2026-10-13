#!/usr/bin/env bash
# CI check for scripts/backup_prod.sh against a throwaway install dir.
# Runs the backup twice and verifies: the DB snapshot restores with the right
# data, photos are copied, unchanged photos are hard links between snapshots,
# and old snapshots are pruned. Needs root (sudo) like the real script.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

export INSTALL_DIR="${WORK}/install"
export BACKUP_DIR="${WORK}/backups"
export RETENTION_DAYS=14
mkdir -p "${INSTALL_DIR}/backend" "${INSTALL_DIR}/uploads"
python3 -m venv "${INSTALL_DIR}/.venv"

python3 - "${INSTALL_DIR}/backend/closet.db" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute("PRAGMA journal_mode=WAL")
c.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT)")
c.execute("INSERT INTO users (username) VALUES ('backup_check')")
c.commit()
PY
echo "photo-a" > "${INSTALL_DIR}/uploads/item_a.png"

# A stale snapshot that should be pruned.
mkdir -p "${BACKUP_DIR}/uploads/20000101T000000Z"
touch -d '30 days ago' "${BACKUP_DIR}/uploads/20000101T000000Z"

bash "${HERE}/backup_prod.sh"
sleep 1
echo "photo-b" > "${INSTALL_DIR}/uploads/item_b.png"
bash "${HERE}/backup_prod.sh"

DB_COUNT="$(find "${BACKUP_DIR}/db" -name 'closet-*.db.gz' | wc -l)"
[[ "${DB_COUNT}" -eq 2 ]] || { echo "expected 2 DB snapshots, got ${DB_COUNT}"; exit 1; }

LATEST_DB="$(find "${BACKUP_DIR}/db" -name 'closet-*.db.gz' | sort | tail -n1)"
gunzip -c "${LATEST_DB}" > "${WORK}/restored.db"
NAME="$(python3 -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('SELECT username FROM users').fetchone()[0])" "${WORK}/restored.db")"
[[ "${NAME}" == "backup_check" ]] || { echo "restored DB has wrong data: ${NAME}"; exit 1; }

[[ ! -d "${BACKUP_DIR}/uploads/20000101T000000Z" ]] || { echo "stale snapshot not pruned"; exit 1; }

mapfile -t SNAPS < <(find "${BACKUP_DIR}/uploads" -mindepth 1 -maxdepth 1 -type d | sort)
[[ "${#SNAPS[@]}" -eq 2 ]] || { echo "expected 2 photo snapshots, got ${#SNAPS[@]}"; exit 1; }
[[ -f "${SNAPS[1]}/item_b.png" ]] || { echo "new photo missing from latest snapshot"; exit 1; }
[[ "$(stat -c %i "${SNAPS[0]}/item_a.png")" == "$(stat -c %i "${SNAPS[1]}/item_a.png")" ]] \
  || { echo "unchanged photo was copied instead of hard-linked"; exit 1; }

echo "backup_prod.sh OK"
