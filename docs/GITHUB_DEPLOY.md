# GitHub Actions → Oracle auto-deploy

Every **push to `main`** that passes **CI** triggers a deploy: `git pull`, `pip install`, restart `closet-org`, reload nginx.

Manual deploy: **Actions → Deploy production → Run workflow**.

---

## One-time setup (≈10 minutes)

### 1. On the server (SSH as `ubuntu`)

After `/opt/closet-org` exists and the app runs:

```bash
cd /opt/closet-org
sudo git pull   # get deploy scripts if needed
sudo bash scripts/setup_github_deploy.sh
```

This script:

- Allows `ubuntu` to run `deploy_prod.sh` with `sudo` without a password
- Creates an SSH key pair for GitHub Actions (or reuses existing)
- Prints the **private key** — you need it for GitHub

Copy the **entire private key** (including `-----BEGIN` / `-----END` lines).

### 2. GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Example | Required |
|--------|---------|----------|
| `DEPLOY_HOST` | `193.122.156.36` | Yes |
| `DEPLOY_USER` | `ubuntu` | Yes |
| `DEPLOY_SSH_KEY` | paste private key from setup script | Yes |

Do **not** commit keys. Do **not** use your personal SSH key — use the deploy-only key from the setup script.

### 3. Push this repo to `main`

```bash
git push origin main
```

Wait for **CI** to finish green, then **Deploy production** should run automatically.

Check: **Actions** tab → latest deploy log ends with `Deploy finished`.

On the server:

```bash
curl -s http://127.0.0.1/healthz
```

---

## What runs on deploy

[`scripts/deploy_prod.sh`](../scripts/deploy_prod.sh):

1. `git pull --ff-only origin main` as `ubuntu`
2. `pip install -r requirements.txt` in `.venv`
3. `chown` runtime dirs to `closet-org`
4. `systemctl restart closet-org`
5. `nginx reload` if config is valid
6. `curl` health check

---

## Bootstrap pull (permission denied on `.git`)

If `git pull` fails as `ubuntu`:

```bash
sudo chown -R ubuntu:ubuntu /opt/closet-org/.git
cd /opt/closet-org
git pull origin main
ls scripts/deploy_prod.sh
```

Then re-run **Deploy production** on GitHub.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Deploy job skipped | CI failed or push was not to `main` — fix tests or use **Run workflow** |
| `Permission denied (publickey)` | Wrong `DEPLOY_SSH_KEY` or key not in `authorized_keys` — re-run setup script |
| `sudo: a password is required` | Re-run `sudo bash scripts/setup_github_deploy.sh` for sudoers |
| `deploy_prod.sh: command not found` | Server repo is behind `main` — bootstrap pull (see below), then re-run deploy |
| `.git/FETCH_HEAD: Permission denied` | Run bootstrap pull below — fixes `.git` ownership for `ubuntu` |
| `git pull` failed | Local changes on server — `cd /opt/closet-org && sudo git status`, stash or reset |
| Health check fails | `journalctl -u closet-org -n 80` on server |

---

## Security notes

- Deploy key should be **read-only** on GitHub if you add it as a deploy key; Actions only needs **SSH to the server**, not GitHub git access (server pulls via HTTPS/SSH as `ubuntu`).
- Oracle security list must allow **TCP 22** from GitHub Actions IPs (wide range) — same as your SSH from home.
- To disable auto-deploy, delete or disable the workflow file, or remove secrets.

---

## Optional: deploy without waiting for CI

Edit [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) to trigger on `push: branches: [main]` instead of `workflow_run` (faster, deploys even if tests fail).
