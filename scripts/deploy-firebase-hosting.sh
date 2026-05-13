#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIREBASE_BIN="${FIREBASE_BIN:-npx}"
FIREBASE_PACKAGE="${FIREBASE_PACKAGE:-firebase-tools@latest}"

run_firebase() {
  if [[ "$FIREBASE_BIN" == "npx" ]]; then
    "$FIREBASE_BIN" --yes "$FIREBASE_PACKAGE" "$@"
    return
  fi
  "$FIREBASE_BIN" "$@"
}

normalize_env_name() {
  local raw="${1:-}"
  raw="$(echo "$raw" | tr '[:upper:]' '[:lower:]')"
  if [[ "$raw" == "production" ]]; then
    raw="prod"
  fi
  echo "$raw"
}

load_env_file() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    return 1
  fi
  echo "[deploy-firebase-hosting] Loading ${env_file}"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  return 0
}

detect_single_env_name() {
  local env_files=()
  local file_name
  for file_name in .env.firebase.*; do
    [[ -f "$file_name" ]] || continue
    [[ "$file_name" == ".env.firebase.example" ]] && continue
    env_files+=("$file_name")
  done
  if [[ "${#env_files[@]}" -eq 1 ]]; then
    normalize_env_name "${env_files[0]#.env.firebase.}"
    return 0
  fi
  echo ""
  return 0
}

load_env_file ".env.gcp" || true
load_env_file ".env.firebase" || true

ENV_NAME="$(normalize_env_name "${DEPLOY_ENV:-${CK_ENV:-${CK_CONFIG_ENV:-}}}")"
if [[ -z "$ENV_NAME" ]]; then
  ENV_NAME="$(detect_single_env_name)"
fi
if [[ -n "$ENV_NAME" ]]; then
  load_env_file ".env.gcp.${ENV_NAME}" || true
  load_env_file ".env.firebase.${ENV_NAME}" || true
fi

FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-${GCP_PROJECT_ID:-}}"
FIREBASE_HOSTING_SITE_ID="${FIREBASE_HOSTING_SITE_ID:-}"
FIREBASE_HOSTING_TARGET="${FIREBASE_HOSTING_TARGET:-web-assets}"
CK_WEB_ASSET_MODE="${CK_WEB_ASSET_MODE:-external}"
CK_WEB_ASSET_BASE_URL="${CK_WEB_ASSET_BASE_URL:-}"
if [[ -z "$CK_WEB_ASSET_BASE_URL" && -n "$FIREBASE_HOSTING_SITE_ID" ]]; then
  CK_WEB_ASSET_BASE_URL="https://${FIREBASE_HOSTING_SITE_ID}.web.app"
fi

export FIREBASE_PROJECT_ID FIREBASE_HOSTING_SITE_ID FIREBASE_HOSTING_TARGET CK_WEB_ASSET_MODE CK_WEB_ASSET_BASE_URL

if [[ "$CK_WEB_ASSET_MODE" != "external" && "$CK_WEB_ASSET_MODE" != "firebase" ]]; then
  echo "[deploy-firebase-hosting] CK_WEB_ASSET_MODE must be external for Firebase Hosting deploys."
  exit 1
fi

if [[ -z "$FIREBASE_PROJECT_ID" || -z "$FIREBASE_HOSTING_SITE_ID" || -z "$CK_WEB_ASSET_BASE_URL" ]]; then
  echo "[deploy-firebase-hosting] FIREBASE_PROJECT_ID/GCP_PROJECT_ID, FIREBASE_HOSTING_SITE_ID, and CK_WEB_ASSET_BASE_URL are required."
  exit 1
fi

if ! run_firebase projects:list --json >/dev/null 2>&1; then
  echo "[deploy-firebase-hosting] Firebase CLI is not authenticated."
  echo "[deploy-firebase-hosting] Run: ${FIREBASE_BIN} ${FIREBASE_PACKAGE} login"
  exit 1
fi

echo "[deploy-firebase-hosting] Building external React assets for ${CK_WEB_ASSET_BASE_URL}."
npm run build:web:react

if [[ ! -f "dist/firebase-hosting/asset-manifest.json" ]]; then
  echo "[deploy-firebase-hosting] Missing dist/firebase-hosting/asset-manifest.json."
  exit 1
fi

if [[ "${SKIP_LINT:-}" != "1" ]]; then
  npm run lint:changed
fi

if [[ "${SKIP_TESTS:-}" != "1" ]]; then
  npm test
fi

run_firebase target:apply hosting "$FIREBASE_HOSTING_TARGET" "$FIREBASE_HOSTING_SITE_ID" --project "$FIREBASE_PROJECT_ID" --non-interactive
run_firebase deploy --only "hosting:${FIREBASE_HOSTING_TARGET}" --project "$FIREBASE_PROJECT_ID" --non-interactive

echo "[deploy-firebase-hosting] Deployed hashed React assets to ${CK_WEB_ASSET_BASE_URL}."
