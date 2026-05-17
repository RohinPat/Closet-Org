# Deploy Closet-Org on AWS (EC2)

This guide runs the **FastAPI backend + SQLite + local uploads + CLIP/rembg** on a single **EC2** instance behind **HTTPS**. It matches how the repo works today (no S3/RDS refactor).

**Expectations**

- **Not** a great fit for AWS Free Tier alone: PyTorch/CLIP/rembg needs **RAM** (plan on **~4 GiB** minimum for headroom) and disk for models + photos.
- One instance = one SQLite writer; scale-out later means architecture changes ([PROJECT.md](../PROJECT.md)).

**What you get at the end**

- `https://your-domain.com` → web UI + `/api/*` + `/uploads/*`
- Mobile app configured with `EXPO_PUBLIC_API_URL=https://your-domain.com`

---

## 1. Prerequisites

- AWS account.
- A **domain** you control (any registrar). You will create DNS records pointing at AWS.
- SSH client on your machine (OpenSSH).
- Your Git repo URL (GitHub clone URL).

---

## 2. Create a key pair (console)

1. EC2 → **Key pairs** → **Create key pair**.
2. Name: `closet-org-prod` (example).
3. Type: **RSA** or **ED25519**.
4. Format: **`.pem`** (macOS/Linux) or **`.ppk`** if you use PuTTY on Windows.
5. Download and store safely; you cannot download again.

---

## 3. Security group

EC2 → **Security groups** → **Create security group**.

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | **My IP** | Remote admin |
| HTTP | 80 | **0.0.0.0/0** | Let’s Encrypt HTTP-01 + redirect to HTTPS |
| HTTPS | 443 | **0.0.0.0/0** | Public API + web |

Do **not** open port **8000** to the internet; the app listens on loopback only.

---

## 4. Launch EC2

1. **Launch instance**.
2. **Name**: e.g. `closet-org-api`.
3. **AMI**: **Ubuntu Server 22.04 LTS** (64-bit x86).
4. **Instance type**: start with **`t3.medium`** (2 vCPU, 4 GiB). If uploads/classify OOM, move up (`t3.large`, `r7i.large`, etc.).
5. **Key pair**: select the key you created.
6. **Network**: default VPC is fine for a first deployment.
7. **Storage**: **gp3** root volume ≥ **64 GiB** (OS + models + room for `uploads/`).
8. **Security group**: attach the group from §3.
9. **Launch**.

Optional but recommended for a stable public IP:

1. **Elastic IPs** → **Allocate**.
2. **Associate** the Elastic IP with this instance.

---

## 5. DNS

Point your domain at the instance:

- **A record**: `your-domain.com` → **Elastic IP** (or instance public IP if you skipped Elastic IP).
- Optional **`www`** **A** or **CNAME** as you prefer.

TTL can stay default; wait for propagation before TLS.

**Route 53:** create a hosted zone for the domain, create the **A** record (alias or simple A to the Elastic IP).  
**Other registrars:** same **A** record in their DNS UI.

---

## 6. First SSH session

Replace host and key path:

```bash
chmod 400 /path/to/closet-org-prod.pem
ssh -i /path/to/closet-org-prod.pem ubuntu@YOUR_PUBLIC_IP_OR_DNS
```

---

## 7. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git python3 python3-venv python3-pip build-essential nginx \
  certbot python3-certbot-nginx tesseract-ocr
```

---

## 8. Application user and directories

```bash
sudo useradd --system --home /opt/closet-org --shell /usr/sbin/nologin closet-org || true
sudo mkdir -p /opt/closet-org
sudo chown ubuntu:ubuntu /opt/closet-org
```

Deploy code as `ubuntu`, run the service as a dedicated user (below).

```bash
cd /opt/closet-org
git clone https://github.com/YOUR_ORG/Closet-Org.git .
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Deactivate when done: `deactivate`.

Give the service user ownership of **writable** paths:

```bash
sudo chown -R closet-org:closet-org /opt/closet-org/backend /opt/closet-org/uploads
sudo chown -R closet-org:closet-org /opt/closet-org/.venv
```

(`closet.db` is under `backend/`; uploads are repo root `uploads/`.)

---

## 9. Secrets and environment file

Create `/etc/closet-org.env` (root-only):

```bash
sudo nano /etc/closet-org.env
```

Contents (replace values):

```env
CLOSET_ENV=production
CLOSET_SECRET_KEY=PASTE_FROM_python_-c_import_secrets_token_urlsafe_48
ALLOWED_ORIGINS=https://your-domain.com
TRUST_PROXY_HEADERS=1
UVICORN_RELOAD=0
HOST=127.0.0.1
PORT=8000
```

Generate `CLOSET_SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Lock permissions:

```bash
sudo chmod 600 /etc/closet-org.env
sudo chown root:root /etc/closet-org.env
```

**`ALLOWED_ORIGINS`**: comma-separated list of **exact** browser origins (scheme + host, no path). Include every hostname you use for the web UI, e.g. `https://your-domain.com,https://www.your-domain.com`.

---

## 10. systemd unit

```bash
sudo nano /etc/systemd/system/closet-org.service
```

```ini
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
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now closet-org
sudo systemctl status closet-org
```

Logs:

```bash
journalctl -u closet-org -f
```

First requests that classify images may download models; watch RAM and logs.

---

## 11. nginx reverse proxy

Create site config:

```bash
sudo nano /etc/nginx/sites-available/closet-org
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25m;
    }
}
```

Enable and test nginx:

```bash
sudo ln -s /etc/nginx/sites-available/closet-org /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 12. TLS (Let’s Encrypt)

DNS **must** resolve to this server before running:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow prompts (email, agree to terms). Certbot adjusts nginx for HTTPS.

Auto-renew is installed via systemd timer; verify:

```bash
sudo certbot renew --dry-run
```

---

## 13. Smoke tests

- Browser: `https://your-domain.com` → register and log in.
- API health-style check if you use one in ops; otherwise upload one clothing photo from the web UI.
- From phone (later): ensure mobile uses **`https://your-domain.com`** as API origin (see §15).

---

## 14. Backups (AWS-native minimum)

- **EBS snapshots** of the instance root volume on a schedule (AWS Backup or Lifecycle Manager).
- Restore = new volume/instance; **test** a restore once.

Snapshots include **`closet.db`** and **`uploads/`** if they live on that volume (they should).

---

## 15. Mobile app (production URL)

Set **exactly** the HTTPS origin (no trailing slash, no `/api`):

- **EAS**: environment secret `EXPO_PUBLIC_API_URL=https://your-domain.com` for release builds, **or**
- **`mobile/app.json`** → `expo.extra.closetApiOrigin`: same URL.

Rebuild the app after changing this. For store/release QA see [README.md § Store release QA](../README.md).

Turn off Android **`usesCleartextTraffic`** when everything is HTTPS-only ([mobile/app.json](../mobile/app.json)).

---

## 16. Operational checklist (from PROJECT.md)

Before trusting this with many users, review [PROJECT.md § Deployment checklist](../PROJECT.md#deployment-checklist) and **Still to build** (refresh tokens, object storage, etc.).

---

## Troubleshooting

| Symptom | Check |
|--------|--------|
| 502 from nginx | `systemctl status closet-org`, `journalctl -u closet-org -n 100` |
| CORS errors in **browser** only | `ALLOWED_ORIGINS` includes your exact `https://` origin |
| Wrong client IP in rate limits | `TRUST_PROXY_HEADERS=1` and nginx forwards `X-Forwarded-*` |
| Out of memory | Larger instance type or reduce concurrent classify load |
| Disk full | EBS volume size + clean old uploads / expand volume |

---

## Optional later upgrades

- **Application Load Balancer + ACM**: TLS at load balancer, targets on private subnets (more moving parts; fix SQLite before multiple targets).
- **S3 + RDS**: aligns with backlog items in PROJECT.md for durable scale-out.
