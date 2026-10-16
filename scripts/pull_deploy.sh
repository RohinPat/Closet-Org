#!/usr/bin/env bash
# Pull-based deploy. Runs on the server every 2 minutes (closet-org-pull-deploy.timer).
#
# If the branch has a new commit AND every GitHub check on that exact commit
# finished successfully, deploy that commit with scripts/deploy_prod.sh.
# Nothing is pushed to the server, so GitHub needs no SSH key or secrets;
# a public repo needs no credentials at all.
#
# Env (all optional):
#   INSTALL_DIR   default /opt/closet-org
#   DEPLOY_USER   user that owns the git checkout (default ubuntu)
#   GIT_BRANCH    default main
#   STATE_DIR     where the last deployed / last rejected commit is kept
#   GITHUB_API    default https://api.github.com (tests point this at a stub)
#   DEPLOY_CMD    default: bash $INSTALL_DIR/scripts/deploy_prod.sh
#   REPO_SLUG     owner/repo for the checks API (default: from the origin URL)
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/closet-org}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
GIT_BRANCH="${GIT_BRANCH:-main}"
STATE_DIR="${STATE_DIR:-/var/lib/closet-org}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"
DEPLOY_CMD="${DEPLOY_CMD:-bash ${INSTALL_DIR}/scripts/deploy_prod.sh}"

mkdir -p "${STATE_DIR}"
exec 9>"${STATE_DIR}/pull-deploy.lock"
if ! flock -n 9; then
  echo "another deploy is running; skipping"
  exit 0
fi

as_owner() {
  if [[ "$(id -un)" == "${DEPLOY_USER}" ]]; then "$@"; else sudo -u "${DEPLOY_USER}" "$@"; fi
}

as_owner git -C "${INSTALL_DIR}" fetch --quiet origin "${GIT_BRANCH}"
target="$(as_owner git -C "${INSTALL_DIR}" rev-parse "origin/${GIT_BRANCH}")"
deployed="$(cat "${STATE_DIR}/deployed_sha" 2>/dev/null || as_owner git -C "${INSTALL_DIR}" rev-parse HEAD)"

if [[ "${target}" == "${deployed}" ]]; then
  exit 0
fi
if [[ "${target}" == "$(cat "${STATE_DIR}/rejected_sha" 2>/dev/null || true)" ]]; then
  exit 0  # already reported; wait for a new commit
fi

# owner/repo from the origin URL (https or ssh form).
remote="$(as_owner git -C "${INSTALL_DIR}" remote get-url origin)"
slug="${REPO_SLUG:-$(sed -E 's#^(https://github.com/|git@github.com:)##; s#\.git$##' <<<"${remote}")}"

checks="$(curl -fsS -H 'Accept: application/vnd.github+json' \
  "${GITHUB_API}/repos/${slug}/commits/${target}/check-runs?per_page=100")"
verdict="$(python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
if not runs:
    print("pending")  # CI has not started yet
elif any(r.get("status") != "completed" for r in runs):
    print("pending")
elif all(r.get("conclusion") in ("success", "skipped", "neutral") for r in runs):
    print("green")
else:
    print("red")
' <<<"${checks}")"

case "${verdict}" in
  pending)
    echo "waiting for CI on ${target:0:12}"
    exit 0
    ;;
  red)
    echo "not deploying ${target:0:12}: CI failed"
    echo "${target}" >"${STATE_DIR}/rejected_sha"
    exit 0
    ;;
esac

echo "deploying ${target:0:12} (was ${deployed:0:12})"
# shellcheck disable=SC2086  # DEPLOY_CMD is a command line, e.g. "bash /path/deploy_prod.sh"
if DEPLOY_SHA="${target}" ${DEPLOY_CMD}; then
  echo "${target}" >"${STATE_DIR}/deployed_sha"
  rm -f "${STATE_DIR}/rejected_sha"
  echo "deployed ${target:0:12}"
else
  echo "deploy of ${target:0:12} failed; will retry on the next run" >&2
  exit 1
fi
