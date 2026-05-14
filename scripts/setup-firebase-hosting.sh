#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIREBASE_BIN="${FIREBASE_BIN:-npx}"
FIREBASE_PACKAGE="${FIREBASE_PACKAGE:-firebase-tools@latest}"
FIREBASE_HOSTING_TARGET="${FIREBASE_HOSTING_TARGET:-web-assets}"

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
  echo "[setup-firebase-hosting] Loading ${env_file}"
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

project_is_firebase_enabled() {
  local json
  json="$(run_firebase projects:list --json 2>/dev/null || true)"
  JSON="$json" PROJECT_ID="$FIREBASE_PROJECT_ID" node -e '
    try {
      const data = JSON.parse(process.env.JSON || "{}");
      const result = data.result || data;
      const projects = Array.isArray(result) ? result : (Array.isArray(result.projects) ? result.projects : []);
      const id = process.env.PROJECT_ID;
      process.exit(projects.some((project) => project && project.projectId === id) ? 0 : 1);
    } catch (_) {
      process.exit(1);
    }
  '
}

hosting_site_exists() {
  local json
  json="$(run_firebase hosting:sites:list --project "$FIREBASE_PROJECT_ID" --json 2>/dev/null || true)"
  JSON="$json" SITE_ID="$FIREBASE_HOSTING_SITE_ID" node -e '
    try {
      const data = JSON.parse(process.env.JSON || "{}");
      const result = data.result || data;
      const sites = Array.isArray(result) ? result : (Array.isArray(result.sites) ? result.sites : []);
      const id = process.env.SITE_ID;
      const found = sites.some((site) => {
        const value = (site.site || site.siteId || site.name || "").toString();
        return value === id || value.split("/").pop() === id;
      });
      process.exit(found ? 0 : 1);
    } catch (_) {
      process.exit(1);
    }
  '
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

if [[ -z "$FIREBASE_PROJECT_ID" || -z "$FIREBASE_HOSTING_SITE_ID" ]]; then
  echo "[setup-firebase-hosting] FIREBASE_PROJECT_ID/GCP_PROJECT_ID and FIREBASE_HOSTING_SITE_ID are required."
  exit 1
fi

if ! run_firebase projects:list --json >/dev/null 2>&1; then
  echo "[setup-firebase-hosting] Firebase CLI is not authenticated."
  echo "[setup-firebase-hosting] Run: ${FIREBASE_BIN} ${FIREBASE_PACKAGE} login"
  exit 1
fi

if project_is_firebase_enabled; then
  echo "[setup-firebase-hosting] Firebase is already enabled for ${FIREBASE_PROJECT_ID}."
elif [[ "${SKIP_FIREBASE_PROJECT_ENABLE:-}" == "1" ]]; then
  echo "[setup-firebase-hosting] Skipping Firebase project enable step because SKIP_FIREBASE_PROJECT_ENABLE=1."
else
  echo "[setup-firebase-hosting] Enabling Firebase for ${FIREBASE_PROJECT_ID}."
  if ! run_firebase projects:addfirebase "$FIREBASE_PROJECT_ID" --non-interactive; then
    echo "[setup-firebase-hosting] Failed to add Firebase resources to ${FIREBASE_PROJECT_ID}."
    echo "[setup-firebase-hosting] The signed-in account needs firebase.projects.update, resourcemanager.projects.get,"
    echo "[setup-firebase-hosting] serviceusage.services.enable, and serviceusage.services.get on the project."
    echo "[setup-firebase-hosting] If Firebase is already enabled, rerun with SKIP_FIREBASE_PROJECT_ENABLE=1."
    exit 1
  fi
fi

if hosting_site_exists; then
  echo "[setup-firebase-hosting] Hosting site ${FIREBASE_HOSTING_SITE_ID} already exists."
else
  echo "[setup-firebase-hosting] Creating Hosting site ${FIREBASE_HOSTING_SITE_ID}."
  if ! run_firebase hosting:sites:create "$FIREBASE_HOSTING_SITE_ID" --project "$FIREBASE_PROJECT_ID" --non-interactive; then
    echo "[setup-firebase-hosting] Failed to create Hosting site ${FIREBASE_HOSTING_SITE_ID}."
    echo "[setup-firebase-hosting] The signed-in account needs Firebase Hosting Admin on the project."
    exit 1
  fi
fi

if ! run_firebase target:apply hosting "$FIREBASE_HOSTING_TARGET" "$FIREBASE_HOSTING_SITE_ID" --project "$FIREBASE_PROJECT_ID" --non-interactive; then
  echo "[setup-firebase-hosting] Failed to write the local Firebase target mapping."
  exit 1
fi

echo "[setup-firebase-hosting] Target ${FIREBASE_HOSTING_TARGET} points to ${FIREBASE_HOSTING_SITE_ID}."
echo "[setup-firebase-hosting] Asset base URL: ${CK_WEB_ASSET_BASE_URL:-https://${FIREBASE_HOSTING_SITE_ID}.web.app}"
