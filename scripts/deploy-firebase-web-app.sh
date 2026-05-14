#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash scripts/deploy-firebase-hosting.sh

export CK_WEB_ASSET_MODE="${CK_WEB_ASSET_MODE:-external}"
if [[ -z "${CK_WEB_ASSET_BASE_URL:-}" && -n "${FIREBASE_HOSTING_SITE_ID:-}" ]]; then
  export CK_WEB_ASSET_BASE_URL="https://${FIREBASE_HOSTING_SITE_ID}.web.app"
fi

npm run deploy:apps-script
