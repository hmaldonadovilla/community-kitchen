#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CLASP_BIN="${CLASP_BIN:-npx}"
CLASP_PACKAGE="${CLASP_PACKAGE:-@google/clasp@latest}"
CLASP_CMD=("$CLASP_BIN")
if [[ "$CLASP_BIN" == "npx" ]]; then
  CLASP_CMD+=("$CLASP_PACKAGE")
fi

run_clasp() {
  "${CLASP_CMD[@]}" "$@"
}

run_webapp_type_check() {
  local phase_label="$1"
  if [[ -z "${CLASP_DEPLOYMENT_ID:-}" ]]; then
    return 0
  fi
  local script_id_current
  script_id_current="$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('.clasp.json','utf8'));process.stdout.write((p.scriptId||'').toString());")"
  if [[ -z "${script_id_current}" ]]; then
    return 0
  fi
  echo "[deploy-apps-script] Verifying deployment entry point (${phase_label})"
  node scripts/check-webapp-deployment.js \
    --script-id "${script_id_current}" \
    --deployment-id "${CLASP_DEPLOYMENT_ID}"
}

normalize_env_name() {
  local raw="${1:-}"
  raw="$(echo "${raw}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${raw}" == "production" ]]; then
    raw="prod"
  fi
  echo "${raw}"
}

load_env_file() {
  local env_file="$1"
  if [[ ! -f "${env_file}" ]]; then
    return 1
  fi
  echo "[deploy-apps-script] Loading ${env_file}"
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
  return 0
}

detect_single_env_name() {
  local env_files=()
  local file_name
  for file_name in .env.deploy.*; do
    [[ -f "${file_name}" ]] || continue
    [[ "${file_name}" == ".env.deploy.example" ]] && continue
    env_files+=("${file_name}")
  done
  if [[ "${#env_files[@]}" -eq 1 ]]; then
    local env_name="${env_files[0]#.env.deploy.}"
    normalize_env_name "${env_name}"
    return 0
  fi
  echo ""
  return 0
}

load_env_file ".env.deploy" || true

ENV_NAME="$(normalize_env_name "${DEPLOY_ENV:-${CK_ENV:-${CK_CONFIG_ENV:-}}}")"
if [[ -z "${ENV_NAME}" ]]; then
  ENV_NAME="$(detect_single_env_name)"
fi

if [[ -n "${ENV_NAME}" ]]; then
  load_env_file ".env.deploy.${ENV_NAME}" || true
fi

ENV_NAME="$(normalize_env_name "${DEPLOY_ENV:-${CK_ENV:-${CK_CONFIG_ENV:-${ENV_NAME}}}}")"

if [[ -n "${ENV_NAME}" && -z "${CK_CONFIG_ENV:-}" ]]; then
  export CK_CONFIG_ENV="${ENV_NAME}"
fi

if [[ -n "${ENV_NAME}" && -f ".clasp.${ENV_NAME}.json" ]]; then
  cp ".clasp.${ENV_NAME}.json" ".clasp.json"
  echo "[deploy-apps-script] Using .clasp.${ENV_NAME}.json"
fi

if [[ -n "${ENV_NAME}" && ! -f ".clasp.${ENV_NAME}.json" && -n "${CLASP_SCRIPT_ID:-}" ]]; then
  export CLASP_FORCE_REWRITE=1
fi

if [[ -n "${CLASP_TARGET_WEB_APP_URL:-}" && -n "${CLASP_DEPLOYMENT_ID:-}" ]]; then
  TARGET_DEPLOYMENT_ID="$(echo "${CLASP_TARGET_WEB_APP_URL}" | sed -nE 's#^.*/s/([^/]+)/exec.*$#\1#p')"
  if [[ -n "${TARGET_DEPLOYMENT_ID}" && "${TARGET_DEPLOYMENT_ID}" != "${CLASP_DEPLOYMENT_ID}" ]]; then
    echo "[deploy-apps-script] CLASP_DEPLOYMENT_ID mismatch."
    echo "[deploy-apps-script] CLASP_DEPLOYMENT_ID=${CLASP_DEPLOYMENT_ID}"
    echo "[deploy-apps-script] CLASP_TARGET_WEB_APP_URL deployment=${TARGET_DEPLOYMENT_ID}"
    echo "[deploy-apps-script] Fix one of them so deploy and test target the same web app URL."
    exit 1
  fi
fi

if [[ "${SKIP_TESTS:-}" != "1" ]]; then
  npm test
fi

npm run build

node scripts/ensure-clasp-config.js
node scripts/prepare-clasp-dist.js

if [[ ! -f "dist/apps-script/Code.js" ]]; then
  echo "[deploy-apps-script] Missing dist/apps-script/Code.js after prepare step."
  exit 1
fi

if ! cmp -s "dist/Code.js" "dist/apps-script/Code.js"; then
  echo "[deploy-apps-script] dist/Code.js and dist/apps-script/Code.js differ. Aborting deploy."
  exit 1
fi

if ! run_clasp login --status >/dev/null 2>&1; then
  echo "[deploy-apps-script] clasp is not authenticated."
  echo "[deploy-apps-script] Run: ${CLASP_CMD[*]} login --redirect-port 53682"
  exit 1
fi

run_clasp push

if [[ -n "${CLASP_DEPLOYMENT_ID:-}" ]]; then
  run_webapp_type_check "pre-deploy"
  DESC=${CLASP_DEPLOY_DESCRIPTION:-"Automated deploy $(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
  run_clasp deploy --deploymentId "$CLASP_DEPLOYMENT_ID" --description "$DESC"
  run_webapp_type_check "post-deploy"
elif [[ "${CLASP_CREATE_DEPLOYMENT:-}" == "1" ]]; then
  DESC=${CLASP_DEPLOY_DESCRIPTION:-"Automated deploy $(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
  run_clasp deploy --description "$DESC"
else
  echo "[deploy-apps-script] Skipping deployment. Set CLASP_DEPLOYMENT_ID or CLASP_CREATE_DEPLOYMENT=1 to deploy."
fi

if [[ -n "${CLASP_DEPLOYMENT_ID:-}" ]]; then
  echo "[deploy-apps-script] Web app URL: https://script.google.com/macros/s/${CLASP_DEPLOYMENT_ID}/exec"
fi
