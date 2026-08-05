#!/usr/bin/env bash
set -eu

RESOURCE_GROUP=agent-scan-dev
MIGRATE_JOB=agentscan-migrate
REGISTRY_NAMESPACE=berzantas
SERVER_IMAGE=vex-agentscan-server
WEB_IMAGE=vex-agentscan-web
MIGRATE_IMAGE=vex-agentscan-migrate
CONTAINER_APPS="api web worker"
PLAN_FILE=release.tfplan
MIGRATION_POLL_SECONDS=5
MIGRATION_POLL_ATTEMPTS=144
REVISION_POLL_SECONDS=5
REVISION_POLL_ATTEMPTS=24
SMOKE_TIMEOUT_SECONDS=120

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tfvars="$repo_root/infra/terraform.tfvars"

abort() {
  echo "release aborted: $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || abort "$1 not found in PATH"
}

require_preconditions() {
  require_command az
  require_command terraform
  require_command git
  require_command curl
  az account show >/dev/null 2>&1 || abort "azure cli is not logged in, run: az login"
  [ -f "$tfvars" ] || abort "missing $tfvars"
}

released_sha() {
  git -C "$repo_root" fetch --quiet origin main
  git -C "$repo_root" rev-parse origin/main
}

require_infra_matches_main() {
  git -C "$repo_root" diff --quiet origin/main -- infra \
    || abort "infra/ differs from origin/main, deploying would mix two versions of the repo"
}

require_image_published() {
  local image=$1
  local sha=$2
  local token
  token=$(curl -sS "https://ghcr.io/token?scope=repository:$REGISTRY_NAMESPACE/$image:pull&service=ghcr.io" \
    | sed -e 's/.*"token":"\([^"]*\)".*/\1/')
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -I \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.v2+json" \
    "https://ghcr.io/v2/$REGISTRY_NAMESPACE/$image/manifests/$sha")
  [ "$code" = "200" ] || abort "$image:$sha is not in ghcr (http $code), wait for the cd workflow to finish"
}

confirm_plan() {
  local sha=$1
  terraform plan -out="$PLAN_FILE" -var "image_tag=$sha"
  printf 'deploy %s? [y/N] ' "$sha"
  local answer
  read -r answer
  [ "$answer" = "y" ] || abort "declined at plan confirmation"
}

migration_status() {
  az containerapp job execution show -n "$MIGRATE_JOB" -g "$RESOURCE_GROUP" \
    --job-execution-name "$1" --query properties.status -o tsv
}

run_migrations() {
  local sha=$1
  az containerapp job update -n "$MIGRATE_JOB" -g "$RESOURCE_GROUP" \
    --image "ghcr.io/$REGISTRY_NAMESPACE/$MIGRATE_IMAGE:$sha" --output none
  local execution
  execution=$(az containerapp job start -n "$MIGRATE_JOB" -g "$RESOURCE_GROUP" --query name -o tsv)
  [ -n "$execution" ] || abort "could not read the execution name from az containerapp job start"
  echo "migration execution $execution started"
  local attempt=0
  while [ "$attempt" -lt "$MIGRATION_POLL_ATTEMPTS" ]; do
    local status
    status=$(migration_status "$execution")
    if [ "$status" = "Succeeded" ]; then
      echo "migrations applied"
      return 0
    fi
    if [ "$status" = "Failed" ]; then
      abort "migration execution $execution failed"
    fi
    sleep "$MIGRATION_POLL_SECONDS"
    attempt=$((attempt + 1))
  done
  abort "migration execution $execution did not finish in time"
}

record_released_tag() {
  local sha=$1
  grep -q '^image_tag' "$tfvars" || abort "no image_tag line in $tfvars"
  sed -i "s|^image_tag.*|image_tag               = \"$sha\"|" "$tfvars"
}

revision_name() {
  az containerapp show -n "$1" -g "$RESOURCE_GROUP" --query "properties.$2" -o tsv
}

require_latest_revision_ready() {
  local app=$1
  local attempt=0
  while [ "$attempt" -lt "$REVISION_POLL_ATTEMPTS" ]; do
    local latest ready
    latest=$(revision_name "$app" latestRevisionName)
    ready=$(revision_name "$app" latestReadyRevisionName)
    if [ "$latest" = "$ready" ]; then
      echo "$app serving $latest"
      return 0
    fi
    sleep "$REVISION_POLL_SECONDS"
    attempt=$((attempt + 1))
  done
  abort "$app: revision $latest never became ready, traffic still on $ready"
}

status_of() {
  curl -sS --max-time "$SMOKE_TIMEOUT_SECONDS" -o /dev/null -w '%{http_code}' "$@"
}

smoke_test() {
  local fqdn=$1
  local root_code stats_code ingest_code
  root_code=$(status_of "https://$fqdn/")
  stats_code=$(status_of "https://$fqdn/api/stats")
  ingest_code=$(status_of -X POST "https://$fqdn/v1/events" \
    -H 'Content-Type: application/json' -d '{}')
  echo "GET  /           $root_code"
  echo "GET  /api/stats  $stats_code"
  echo "POST /v1/events  $ingest_code"
  [ "$root_code" = "200" ] || abort "smoke test: / returned $root_code"
  [ "$stats_code" = "200" ] || abort "smoke test: /api/stats returned $stats_code"
}

require_preconditions
sha=$(released_sha)
require_infra_matches_main
echo "releasing origin/main at $sha"

require_image_published "$SERVER_IMAGE" "$sha"
require_image_published "$WEB_IMAGE" "$sha"
require_image_published "$MIGRATE_IMAGE" "$sha"

cd "$repo_root/infra"
confirm_plan "$sha"
run_migrations "$sha"
record_released_tag "$sha"
terraform apply "$PLAN_FILE"

for app in $CONTAINER_APPS; do
  require_latest_revision_ready "$app"
done

fqdn=$(terraform output -raw routing_fqdn)
smoke_test "$fqdn"

echo "released $sha to https://$fqdn"
