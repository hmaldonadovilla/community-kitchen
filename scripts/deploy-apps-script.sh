#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f ".env.deploy" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.deploy"
  set +a
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
