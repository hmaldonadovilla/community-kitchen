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
  echo "[deploy-cloud-run] Loading ${env_file}"
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
    echo "[deploy-cloud-run] Missing required variable: ${name}"
    exit 1
  fi
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
require_var "GCP_CLOUD_RUN_SERVICE"
require_var "GCP_CLOUD_RUN_SOURCE_DIR"
require_var "GCP_RUNTIME_SERVICE_ACCOUNT_ID"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[deploy-cloud-run] gcloud is not installed."
  echo "[deploy-cloud-run] Install Google Cloud CLI first: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "[deploy-cloud-run] gcloud is not authenticated."
  echo "[deploy-cloud-run] Run: gcloud auth login"
  exit 1
fi

SOURCE_DIR="${GCP_CLOUD_RUN_SOURCE_DIR}"
if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "[deploy-cloud-run] Source directory not found: ${SOURCE_DIR}"
  exit 1
fi

gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

RUNTIME_SA_EMAIL="${GCP_RUNTIME_SERVICE_ACCOUNT_ID}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
ACCESS_FLAG="--no-allow-unauthenticated --invoker-iam-check"
if [[ "${GCP_ALLOW_UNAUTHENTICATED:-1}" == "1" ]]; then
  ACCESS_FLAG="--no-invoker-iam-check"
fi

ENV_VARS="CK_ENV=${ENV_NAME:-default},GCP_PROJECT_ID=${GCP_PROJECT_ID}"
if [[ -n "${GCP_FIRESTORE_DATABASE:-}" ]]; then
  ENV_VARS="${ENV_VARS},GCP_FIRESTORE_DATABASE=${GCP_FIRESTORE_DATABASE}"
fi

echo "[deploy-cloud-run] Deploying ${GCP_CLOUD_RUN_SERVICE} from ${SOURCE_DIR}"
gcloud run deploy "${GCP_CLOUD_RUN_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --source="${SOURCE_DIR}" \
  --service-account="${RUNTIME_SA_EMAIL}" \
  --set-env-vars="${ENV_VARS}" \
  ${ACCESS_FLAG}

SERVICE_URL="$(gcloud run services describe "${GCP_CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --format='value(status.url)')"
echo "[deploy-cloud-run] Service URL: ${SERVICE_URL}"
