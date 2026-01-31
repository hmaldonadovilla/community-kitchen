#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_NAME="${DEPLOY_ENV:-${CK_ENV:-}}"
if [[ -n "${ENV_NAME}" ]]; then
  ENV_NAME="$(echo "${ENV_NAME}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${ENV_NAME}" == "production" ]]; then
    ENV_NAME="prod"
  fi
fi

if [[ -n "${ENV_NAME}" && -f ".env.deploy.${ENV_NAME}" ]]; then
  echo "[deploy-apps-script] Loading .env.deploy.${ENV_NAME}"
  set -a
  # shellcheck disable=SC1091
  source ".env.deploy.${ENV_NAME}"
  set +a
elif [[ -f ".env.deploy" ]]; then
  echo "[deploy-apps-script] Loading .env.deploy"
  set -a
  # shellcheck disable=SC1091
  source ".env.deploy"
  set +a
fi

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

if [[ "${SKIP_TESTS:-}" != "1" ]]; then
  npm test
fi

npm run build

node scripts/ensure-clasp-config.js
node scripts/prepare-clasp-dist.js

npx clasp push

if [[ -n "${CLASP_DEPLOYMENT_ID:-}" ]]; then
  DESC=${CLASP_DEPLOY_DESCRIPTION:-"Automated deploy $(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
  npx clasp deploy --deploymentId "$CLASP_DEPLOYMENT_ID" --description "$DESC"
elif [[ "${CLASP_CREATE_DEPLOYMENT:-}" == "1" ]]; then
  DESC=${CLASP_DEPLOY_DESCRIPTION:-"Automated deploy $(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
  npx clasp deploy --description "$DESC"
else
  echo "[deploy-apps-script] Skipping deployment. Set CLASP_DEPLOYMENT_ID or CLASP_CREATE_DEPLOYMENT=1 to deploy."
fi
