# Servers and deploys

Two ideas keep this simple and provider-agnostic:

1. **One-paste setup.** `scripts/cloud-init.yaml` turns a fresh Ubuntu VM into a running Closet-Org server on its first boot. No SSH steps.
2. **Pull-based deploys.** The server checks GitHub every 2 minutes. When `main` has a new commit and **every CI check on that exact commit passed**, it deploys that commit. GitHub never connects to the server, so there are no SSH keys or secrets to set up or lose.

---

## Create a server (about 5 minutes of clicking, 15 minutes of waiting)

Any Ubuntu 22.04/24.04 VM with at least 4 GB RAM works (x86 or ARM); 6 GB+ is more comfortable. The AI models need the memory, so 1 GB "micro" shapes won't do.

### Oracle Cloud (Always Free)

1. **Compute → Instances → Create instance**
2. **Image:** Canonical Ubuntu 24.04. **Shape:** Ampere `VM.Standard.A1.Flex`, 2 OCPU / 12 GB (1 OCPU / 6 GB also works).
   "Out of capacity"? Try another availability domain, try later, or upgrade the account to Pay As You Go (Always Free resources stay $0, capacity is much better, and idle instances aren't reclaimed).
3. **Advanced options → Management → Initialization script → Paste cloud-init script:** paste all of [`scripts/cloud-init.yaml`](../scripts/cloud-init.yaml).
4. **Networking:** keep "Automatically assign public IPv4 address" on. **SSH keys:** paste your public key (so you can log in later if needed).
5. **Create.** Then open web traffic: instance page → subnet → **Default Security List → Add Ingress Rules**: source `0.0.0.0/0`, TCP, port `80`; again for `443`.

### Hetzner (≈ $4–5/month, no capacity lottery)

**Create server** → Ubuntu 24.04, CAX11 (ARM, 4 GB) or larger → **Cloud config:** paste `scripts/cloud-init.yaml` → add your SSH key → Create. Hetzner's firewall is open by default.

### Check it

```bash
curl http://<server-ip>/healthz          # {"status":"ok"} when setup is done
ssh ubuntu@<server-ip> 'tail -n 30 /var/log/closet-org-setup.log'   # progress (root@ on Hetzner)
```

Then point the app at it: `EXPO_PUBLIC_API_URL` in `mobile/eas.json`, and the URLs in `docs/STORE_LISTINGS.md`.

---

## How deploys work

`scripts/deploy_prod.sh` installs a systemd timer, `closet-org-pull-deploy.timer`, that runs [`scripts/pull_deploy.sh`](../scripts/pull_deploy.sh) every 2 minutes:

| New commit on `main`, CI is… | What happens |
|---|---|
| not started / still running | waits, checks again in 2 minutes |
| green (all checks success/skipped) | deploys **that exact commit** (`DEPLOY_SHA`), even if newer commits landed since |
| red | not deployed; logged once, then ignored until the next commit |
| deploy itself fails | previous version stays recorded as live; retried next run |

So a typical merge is live about 2–3 minutes after CI finishes. Each deploy runs `deploy_prod.sh`: checkout, `pip install`, timers, grid-thumbnail backfill, restart, health check.

```bash
systemctl list-timers 'closet-org-*'                 # pull-deploy + backup timers
journalctl -u closet-org-pull-deploy -n 30 --no-pager  # last deploy decisions
cat /var/lib/closet-org/deployed_sha                 # what's live
sudo systemctl start closet-org-pull-deploy          # check right now
```

`.github/workflows/ci.yml` (`ops-scripts`) tests `pull_deploy.sh` against a local repo and a stub of GitHub's checks API, and validates `cloud-init.yaml` with `cloud-init schema`.

The repo is public, so the server needs no credentials. If it ever goes private, give the server a read-only deploy key and switch its `origin` to the SSH URL.

---

## Manual / fallback

- **Deploy now from the server:** `sudo bash /opt/closet-org/scripts/deploy_prod.sh`
- **Deploy from GitHub:** Actions → **Deploy production (manual)** → Run workflow. This one pushes over SSH and needs repository secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (`sudo bash scripts/setup_github_deploy.sh` on the server prints the key).
- **Set up an existing server by hand** (instead of cloud-init):
  ```bash
  git clone https://github.com/RohinPat/Closet-Org.git /tmp/co
  sudo CLOSET_REPO_URL=https://github.com/RohinPat/Closet-Org.git bash /tmp/co/scripts/provision_ubuntu_prod.sh
  ```
  Add `PUBLIC_HOSTNAME=api.yourdomain.com CERTBOT_EMAIL=you@x.com` to get HTTPS once DNS points at the server.

## Troubleshooting

| Problem | Fix |
|---|---|
| `/healthz` doesn't answer after 20 min | `tail -n 80 /var/log/closet-org-setup.log`; on Oracle check the Security List rules for 80/443 |
| A merge isn't live | `journalctl -u closet-org-pull-deploy -n 30` shows "waiting for CI", "CI failed", or the deploy error |
| Health check fails / 502 | `journalctl -u closet-org -n 50`; SQLite permissions: `sudo chown closet-org:closet-org /opt/closet-org/backend/closet.db*` |
| `git` errors on the server | local changes in `/opt/closet-org`: `sudo -u ubuntu git -C /opt/closet-org status`, then stash or reset |

Backups: see [BACKUPS.md](BACKUPS.md).
