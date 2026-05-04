#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
  return 0
}

detect_single_env_name() {
  local env_files=()
  local file_name
  for file_name in .env.gcp.*; do
    [[ -f "${file_name}" ]] || continue
    [[ "${file_name}" == ".env.gcp.example" ]] && continue
    env_files+=("${file_name}")
  done
  if [[ "${#env_files[@]}" -eq 1 ]]; then
    local env_name="${env_files[0]#.env.gcp.}"
    normalize_env_name "${env_name}"
    return 0
  fi
  echo ""
  return 0
}

load_env_file ".env.gcp" || true
ENV_NAME="$(normalize_env_name "${DEPLOY_ENV:-${CK_ENV:-}}")"
if [[ -z "${ENV_NAME}" ]]; then
  ENV_NAME="$(detect_single_env_name)"
fi
if [[ -n "${ENV_NAME}" ]]; then
  load_env_file ".env.gcp.${ENV_NAME}" || true
fi
ENV_NAME="$(normalize_env_name "${DEPLOY_ENV:-${CK_ENV:-${ENV_NAME}}}")"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[check-gcp-backend] gcloud is not installed."
  exit 1
fi

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GCP_REGION:-}"
DATABASE="${GCP_FIRESTORE_DATABASE:-}"
SERVICE="${GCP_CLOUD_RUN_SERVICE:-}"
SA_ID="${GCP_RUNTIME_SERVICE_ACCOUNT_ID:-}"
PROJECT_NUMBER=""
if [[ -n "${PROJECT_ID}" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)' 2>/dev/null || true)"
fi

echo "Environment: ${ENV_NAME:-default}"
echo "Project: ${PROJECT_ID:-<unset>}"
echo "Region: ${REGION:-<unset>}"

if [[ -n "${PROJECT_ID}" ]]; then
  gcloud config set project "${PROJECT_ID}" >/dev/null
fi

echo
echo "Enabled APIs:"
gcloud services list --enabled --format='value(config.name)' 2>/dev/null | grep -E '^(run|cloudbuild|artifactregistry|firestore|sheets|drive|gmail|iam|iamcredentials)\.googleapis\.com$' || true

echo
echo "Firestore:"
if [[ -n "${DATABASE}" ]] && gcloud firestore databases describe --database="${DATABASE}" >/dev/null 2>&1; then
  gcloud firestore databases describe --database="${DATABASE}" --format='value(name,locationId,type)'
else
  echo "not configured or not created"
fi

echo
echo "Runtime service account:"
if [[ -n "${PROJECT_ID}" && -n "${SA_ID}" ]]; then
  SA_EMAIL="${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then
    echo "${SA_EMAIL}"
  else
    echo "not created"
  fi
else
  echo "not configured"
fi

echo
echo "Build service account:"
if [[ -n "${PROJECT_NUMBER}" ]]; then
  BUILD_SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  if gcloud iam service-accounts describe "${BUILD_SA_EMAIL}" >/dev/null 2>&1; then
    echo "${BUILD_SA_EMAIL}"
  else
    echo "not found"
  fi
else
  echo "not configured"
fi

echo
echo "Cloud Run service:"
if [[ -n "${SERVICE}" && -n "${REGION}" ]] && gcloud run services describe "${SERVICE}" --region="${REGION}" >/dev/null 2>&1; then
  gcloud run services describe "${SERVICE}" --region="${REGION}" --format='value(metadata.name,status.url,spec.template.spec.serviceAccountName)'
else
  echo "not deployed"
fi
