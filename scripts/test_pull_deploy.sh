#!/usr/bin/env bash
# CI check for scripts/pull_deploy.sh against a local git repo and a stub of
# GitHub's check-runs API. No root needed: runs as the current user.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
export WORK
STUB_PID=""
cleanup() { [[ -n "${STUB_PID}" ]] && kill "${STUB_PID}" 2>/dev/null || true; rm -rf "${WORK}"; }
trap cleanup EXIT

# Linux has flock; for running this on a dev machine without it, stand in.
if ! command -v flock >/dev/null; then
  mkdir -p "${WORK}/bin"
  printf '#!/usr/bin/env bash\nexit 0\n' >"${WORK}/bin/flock"
  chmod +x "${WORK}/bin/flock"
  export PATH="${WORK}/bin:${PATH}"
fi

# ---- a fake origin with commits, and a checkout like /opt/closet-org ----------
git init -q --bare -b main "${WORK}/origin.git"
git clone -q "${WORK}/origin.git" "${WORK}/dev" 2>/dev/null
commit() {
  echo "$1" >"${WORK}/dev/version"
  git -C "${WORK}/dev" add version
  git -C "${WORK}/dev" -c user.email=t@t -c user.name=t commit -qm "$1"
  git -C "${WORK}/dev" push -q origin HEAD:main
  git -C "${WORK}/dev" rev-parse HEAD
}
A="$(commit a)"
git clone -q "${WORK}/origin.git" "${WORK}/install"

# ---- stub check-runs API ---------------------------------------------------------
echo '{}' >"${WORK}/checks.json"
: >"${WORK}/api_hits"
cat >"${WORK}/stub.py" <<'PY'
import http.server, json, sys, pathlib
work = pathlib.Path(sys.argv[1])
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        sha = self.path.split("/commits/")[1].split("/")[0]
        with open(work / "api_hits", "a") as f:
            f.write(sha + "\n")
        runs = json.loads((work / "checks.json").read_text()).get(sha, [])
        body = json.dumps({"total_count": len(runs), "check_runs": runs}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
(work / "port").write_text(str(srv.server_port))
srv.serve_forever()
PY
python3 "${WORK}/stub.py" "${WORK}" &
STUB_PID=$!
for _ in $(seq 50); do [[ -s "${WORK}/port" ]] && break; sleep 0.1; done

set_checks() {  # set_checks <sha> <status> <conclusion>   (status "none" = no runs yet)
  python3 - "$WORK/checks.json" "$1" "$2" "$3" <<'PY'
import json, sys
path, sha, status, conclusion = sys.argv[1:]
d = json.load(open(path))
d[sha] = [] if status == "none" else [
    {"name": "backend", "status": status, "conclusion": conclusion or None},
    {"name": "mobile", "status": "completed", "conclusion": "success"},
]
json.dump(d, open(path, "w"))
PY
}

# Deploy stand-in: records the commit it was asked to deploy; can be told to fail.
cat >"${WORK}/fake_deploy.sh" <<'SH'
#!/usr/bin/env bash
[[ -f "$WORK/fail_next" ]] && { rm -f "$WORK/fail_next"; exit 1; }
echo "$DEPLOY_SHA" >>"$WORK/deploys"
SH
chmod +x "${WORK}/fake_deploy.sh"
: >"${WORK}/deploys"

run() {
  INSTALL_DIR="${WORK}/install" DEPLOY_USER="$(id -un)" STATE_DIR="${WORK}/state" \
    GITHUB_API="http://127.0.0.1:$(cat "${WORK}/port")" REPO_SLUG="test/repo" \
    DEPLOY_CMD="${WORK}/fake_deploy.sh" bash "${HERE}/pull_deploy.sh"
}
fail() { echo "FAIL: $*"; exit 1; }
deploy_count() { wc -l <"${WORK}/deploys" | tr -d ' '; }

# 1. Nothing new: no API call, no deploy.
run >/dev/null
[[ "$(deploy_count)" == 0 && ! -s "${WORK}/api_hits" ]] || fail "deployed or called API with nothing new"

# 2. New commit, CI not started, then running: wait.
B="$(commit b)"
set_checks "$B" none ""
run | grep -q "waiting for CI" || fail "should wait when CI has not started"
set_checks "$B" in_progress ""
run | grep -q "waiting for CI" || fail "should wait while CI runs"
[[ "$(deploy_count)" == 0 ]] || fail "deployed before CI finished"

# 3. CI green: deploy exactly B; running again is a no-op.
set_checks "$B" completed success
run | grep -q "deployed" || fail "should deploy a green commit"
[[ "$(tail -1 "${WORK}/deploys")" == "$B" ]] || fail "deployed the wrong commit"
run >/dev/null
[[ "$(deploy_count)" == 1 ]] || fail "redeployed the same commit"

# 4. Red commit: rejected once, then not even re-checked.
C="$(commit c)"
set_checks "$C" completed failure
run | grep -q "CI failed" || fail "should refuse a red commit"
hits_before="$(wc -l <"${WORK}/api_hits")"
run >/dev/null
[[ "$(wc -l <"${WORK}/api_hits")" == "${hits_before}" ]] || fail "kept polling a rejected commit"
[[ "$(deploy_count)" == 1 ]] || fail "deployed a red commit"

# 5. A later green commit goes out.
D="$(commit d)"
set_checks "$D" completed success
run >/dev/null
[[ "$(tail -1 "${WORK}/deploys")" == "$D" ]] || fail "did not deploy the next green commit"

# 6. A failing deploy keeps the old version recorded and retries next time.
E="$(commit e)"
set_checks "$E" completed success
touch "${WORK}/fail_next"
if run >/dev/null 2>&1; then fail "a failed deploy should exit non-zero"; fi
[[ "$(cat "${WORK}/state/deployed_sha")" == "$D" ]] || fail "recorded a failed deploy as live"
run >/dev/null
[[ "$(cat "${WORK}/state/deployed_sha")" == "$E" ]] || fail "did not retry after a failed deploy"

echo "pull_deploy.sh OK (A=${A:0:7} -> deployed ${B:0:7}, ${D:0:7}, ${E:0:7}; skipped red ${C:0:7})"
