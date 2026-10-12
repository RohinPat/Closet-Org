# Backups

Everything that matters lives in two places on the server: the SQLite database (`backend/closet.db`) and the photo folder (`uploads/`). `scripts/backup_prod.sh` backs up both every night.

## What runs

`scripts/deploy_prod.sh` installs a systemd timer, `closet-org-backup.timer`, which runs at about 03:30 UTC. Each run does the following:

1. **Database:** takes an online snapshot with SQLite's backup API, which is safe while the app is running. It checks the snapshot with `PRAGMA integrity_check`, then gzips it to `/var/backups/closet-org/db/closet-<timestamp>.db.gz`.
2. **Photos:** writes a daily snapshot to `/var/backups/closet-org/uploads/<timestamp>/` with `rsync --link-dest`. Photos that haven't changed are hard links, so each extra day only uses space for new photos.
3. **Retention:** deletes local snapshots older than 14 days.
4. **Off-site copy (optional):** if `BACKUP_RCLONE_REMOTE` is set, copies the DB snapshots and mirrors the photos to object storage. Files deleted from `uploads/` are kept in a dated `deleted-*` folder for 14 days.

`.github/workflows/ci.yml` (`ops-scripts` job) runs the script end to end on every PR.

```bash
systemctl list-timers closet-org-backup.timer   # next / last run
journalctl -u closet-org-backup -n 50           # last run's output
sudo systemctl start closet-org-backup          # run one now
```

## Turn on off-site backups (recommended)

Local snapshots protect against bad deploys and accidental deletes, but not against losing the VM. To protect against that, copy them off the box, for example to Cloudflare R2 (10 GB free) or Backblaze B2:

1. `sudo apt-get install -y rclone`
2. `sudo rclone config`, then create a remote, e.g. `r2` (type `s3`, provider `Cloudflare`, with the access key and secret from the R2 dashboard). It is saved to `/root/.config/rclone/rclone.conf`.
3. Create a bucket, e.g. `closet-org-backups`.
4. Create `/etc/closet-org-backup.env` with mode `600`:
   ```bash
   BACKUP_RCLONE_REMOTE=r2:closet-org-backups
   # RETENTION_DAYS=14
   ```
5. `sudo systemctl start closet-org-backup && journalctl -u closet-org-backup -n 30`

## Restore

```bash
sudo systemctl stop closet-org
cd /opt/closet-org

# Database: pick a snapshot (or download one from the off-site bucket first)
ls -1 /var/backups/closet-org/db/
sudo cp backend/closet.db backend/closet.db.before-restore
sudo rm -f backend/closet.db-wal backend/closet.db-shm
gunzip -c /var/backups/closet-org/db/closet-<timestamp>.db.gz | sudo tee backend/closet.db >/dev/null

# Photos: copy back from a snapshot (or `rclone copy r2:closet-org-backups/uploads/current uploads/`)
sudo rsync -a /var/backups/closet-org/uploads/<timestamp>/ uploads/

sudo chown -R closet-org:closet-org backend/closet.db uploads
sudo systemctl start closet-org
curl -fsS http://127.0.0.1:8000/healthz
```

Practice a restore on a spare VM once. A backup you have never restored is a guess.

## Account deletion and backups

Deleting an account removes the data from the live database and disk right away. Copies in snapshots age out after `RETENTION_DAYS` (14). The privacy page says the same thing, so keep the two in sync if you change retention.
