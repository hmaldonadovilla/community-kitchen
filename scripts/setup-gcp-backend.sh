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
  echo "[setup-gcp-backend] Loading ${env_file}"
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

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "[setup-gcp-backend] Missing required variable: ${name}"
    exit 1
  fi
}

wait_for_service_account() {
  local service_account_email="$1"
  local attempt
  for attempt in {1..10}; do
    if gcloud iam service-accounts describe "${service_account_email}" >/dev/null 2>&1; then
      return 0
    fi
    echo "[setup-gcp-backend] Waiting for service account propagation (${attempt}/10)"
    sleep 3
  done
  echo "[setup-gcp-backend] Service account did not become visible in time: ${service_account_email}"
  exit 1
}

grant_project_role() {
  local project_id="$1"
  local service_account_email="$2"
  local role="$3"
  local attempt
  for attempt in {1..10}; do
    if gcloud projects add-iam-policy-binding "${project_id}" \
      --member="serviceAccount:${service_account_email}" \
      --role="${role}" \
      >/dev/null 2>&1; then
      return 0
    fi
    echo "[setup-gcp-backend] Retrying IAM binding for ${service_account_email} (${attempt}/10)"
    sleep 3
  done
  echo "[setup-gcp-backend] Failed to grant ${role} to ${service_account_email}"
  exit 1
}

grant_service_account_role() {
  local service_account_email="$1"
  local member_email="$2"
  local role="$3"
  local attempt
  for attempt in {1..10}; do
    if gcloud iam service-accounts add-iam-policy-binding "${service_account_email}" \
      --member="serviceAccount:${member_email}" \
      --role="${role}" \
      >/dev/null 2>&1; then
      return 0
    fi
    echo "[setup-gcp-backend] Retrying service-account IAM binding for ${member_email} (${attempt}/10)"
    sleep 3
  done
  echo "[setup-gcp-backend] Failed to grant ${role} on ${service_account_email} to ${member_email}"
  exit 1
}

get_project_number() {
  gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)'
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

require_var "GCP_PROJECT_ID"
require_var "GCP_REGION"
require_var "GCP_FIRESTORE_DATABASE"
require_var "GCP_FIRESTORE_LOCATION"
require_var "GCP_RUNTIME_SERVICE_ACCOUNT_ID"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[setup-gcp-backend] gcloud is not installed."
  echo "[setup-gcp-backend] Install Google Cloud CLI first: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "[setup-gcp-backend] gcloud is not authenticated."
  echo "[setup-gcp-backend] Run: gcloud auth login"
  exit 1
fi

echo "[setup-gcp-backend] Active account: ${ACTIVE_ACCOUNT}"
echo "[setup-gcp-backend] Project: ${GCP_PROJECT_ID}"
echo "[setup-gcp-backend] Region: ${GCP_REGION}"
echo "[setup-gcp-backend] Firestore database: ${GCP_FIRESTORE_DATABASE}"
echo "[setup-gcp-backend] Firestore location: ${GCP_FIRESTORE_LOCATION}"

gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

PROJECT_NUMBER="$(get_project_number)"
if [[ -z "${PROJECT_NUMBER}" ]]; then
  echo "[setup-gcp-backend] Unable to resolve project number for ${GCP_PROJECT_ID}"
  exit 1
fi
BUILD_SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "[setup-gcp-backend] Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  sheets.googleapis.com \
  drive.googleapis.com \
  docs.googleapis.com \
  cloudscheduler.googleapis.com \
  gmail.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com

if gcloud firestore databases describe --database="${GCP_FIRESTORE_DATABASE}" >/dev/null 2>&1; then
  echo "[setup-gcp-backend] Firestore database already exists"
else
  echo "[setup-gcp-backend] Creating Firestore database"
  gcloud firestore databases create \
    --database="${GCP_FIRESTORE_DATABASE}" \
    --location="${GCP_FIRESTORE_LOCATION}" \
    --type=firestore-native \
    --delete-protection
fi

RUNTIME_SA_EMAIL="${GCP_RUNTIME_SERVICE_ACCOUNT_ID}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "${RUNTIME_SA_EMAIL}" >/dev/null 2>&1; then
  echo "[setup-gcp-backend] Runtime service account already exists"
else
  echo "[setup-gcp-backend] Creating runtime service account"
  gcloud iam service-accounts create "${GCP_RUNTIME_SERVICE_ACCOUNT_ID}" \
    --display-name="Community Kitchen API (${ENV_NAME:-default})"
fi

wait_for_service_account "${RUNTIME_SA_EMAIL}"

echo "[setup-gcp-backend] Granting Firestore access to runtime service account"
grant_project_role "${GCP_PROJECT_ID}" "${RUNTIME_SA_EMAIL}" "roles/datastore.user"

echo "[setup-gcp-backend] Granting runtime service account permission to sign delegated Gmail JWTs"
grant_service_account_role "${RUNTIME_SA_EMAIL}" "${RUNTIME_SA_EMAIL}" "roles/iam.serviceAccountTokenCreator"

echo "[setup-gcp-backend] Granting Cloud Run build access to default build service account"
grant_project_role "${GCP_PROJECT_ID}" "${BUILD_SA_EMAIL}" "roles/run.builder"

echo "[setup-gcp-backend] Done"
echo "[setup-gcp-backend] Runtime service account: ${RUNTIME_SA_EMAIL}"
echo "[setup-gcp-backend] Build service account: ${BUILD_SA_EMAIL}"
echo "[setup-gcp-backend] Next step: npm run deploy:cloud-run"
