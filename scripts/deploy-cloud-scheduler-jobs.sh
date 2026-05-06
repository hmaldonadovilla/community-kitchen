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
  echo "[deploy-cloud-scheduler] Loading ${env_file}"
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
    echo "[deploy-cloud-scheduler] Missing required variable: ${name}"
    exit 1
  fi
}

upsert_http_job() {
  local job_name="$1"
  local schedule="$2"
  local uri="$3"
  local body="$4"

  local base_args=(
    "--project=${GCP_PROJECT_ID}"
    "--location=${GCP_REGION}"
    "--schedule=${schedule}"
    "--time-zone=${CK_TIMEZONE:-Europe/Brussels}"
    "--uri=${uri}"
    "--http-method=POST"
    "--message-body=${body}"
  )
  local headers="Content-Type=application/json,x-ck-scheduler-secret=${CK_SCHEDULER_SECRET}"

  if gcloud scheduler jobs describe "${job_name}" \
    --project="${GCP_PROJECT_ID}" \
    --location="${GCP_REGION}" \
    >/dev/null 2>&1; then
    echo "[deploy-cloud-scheduler] Updating ${job_name}"
    gcloud scheduler jobs update http "${job_name}" "${base_args[@]}" "--update-headers=${headers}"
  else
    echo "[deploy-cloud-scheduler] Creating ${job_name}"
    gcloud scheduler jobs create http "${job_name}" "${base_args[@]}" "--headers=${headers}"
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
require_var "CK_SCHEDULER_SECRET"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[deploy-cloud-scheduler] gcloud is not installed."
  echo "[deploy-cloud-scheduler] Install Google Cloud CLI first: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "[deploy-cloud-scheduler] gcloud is not authenticated."
  echo "[deploy-cloud-scheduler] Run: gcloud auth login"
  exit 1
fi

gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

SERVICE_URL="$(gcloud run services describe "${GCP_CLOUD_RUN_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --format='value(status.url)')"

if [[ -z "${SERVICE_URL}" ]]; then
  echo "[deploy-cloud-scheduler] Unable to resolve Cloud Run service URL for ${GCP_CLOUD_RUN_SERVICE}."
  exit 1
fi

QUEUE_JOB_NAME="${CK_SCHEDULER_QUEUE_JOB_NAME:-${GCP_CLOUD_RUN_SERVICE}-analytics-queue}"
EMAIL_QUEUE_JOB_NAME="${CK_SCHEDULER_EMAIL_QUEUE_JOB_NAME:-${GCP_CLOUD_RUN_SERVICE}-followup-email-queue}"
ANALYTICS_JOB_NAME="${CK_SCHEDULER_ANALYTICS_JOB_NAME:-${GCP_CLOUD_RUN_SERVICE}-daily-analytics}"
LIFECYCLE_JOB_NAME="${CK_SCHEDULER_LIFECYCLE_JOB_NAME:-${GCP_CLOUD_RUN_SERVICE}-daily-lifecycle}"

QUEUE_SCHEDULE="${CK_SCHEDULER_QUEUE_SCHEDULE:-*/5 * * * *}"
EMAIL_QUEUE_SCHEDULE="${CK_SCHEDULER_EMAIL_QUEUE_SCHEDULE:-* * * * *}"
ANALYTICS_SCHEDULE="${CK_SCHEDULER_ANALYTICS_SCHEDULE:-0 23 * * *}"
LIFECYCLE_SCHEDULE="${CK_SCHEDULER_LIFECYCLE_SCHEDULE:-0 2 * * *}"
QUEUE_LIMIT="${CK_ANALYTICS_QUEUE_BATCH_SIZE:-10}"
EMAIL_QUEUE_LIMIT="${CK_FOLLOWUP_EMAIL_QUEUE_BATCH_SIZE:-10}"

upsert_http_job \
  "${QUEUE_JOB_NAME}" \
  "${QUEUE_SCHEDULE}" \
  "${SERVICE_URL}/api/jobs/runQueuedAnalyticsPipelineJobs" \
  "{\"limit\":${QUEUE_LIMIT}}"

upsert_http_job \
  "${EMAIL_QUEUE_JOB_NAME}" \
  "${EMAIL_QUEUE_SCHEDULE}" \
  "${SERVICE_URL}/api/jobs/runQueuedFollowupEmailJobs" \
  "{\"limit\":${EMAIL_QUEUE_LIMIT}}"

upsert_http_job \
  "${ANALYTICS_JOB_NAME}" \
  "${ANALYTICS_SCHEDULE}" \
  "${SERVICE_URL}/api/jobs/runDailyAnalyticsRecompute" \
  "{}"

upsert_http_job \
  "${LIFECYCLE_JOB_NAME}" \
  "${LIFECYCLE_SCHEDULE}" \
  "${SERVICE_URL}/api/jobs/runDailyLifecycleRecompute" \
  "{}"

echo "[deploy-cloud-scheduler] Done"
