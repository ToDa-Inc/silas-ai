#!/usr/bin/env bash
# Batch POST existing analyze-bulk via curl only (no new endpoints).
# Tip: log updates may batch-buffer; for live tail use:
#   stdbuf -oL -eL bash scripts/run-competitor-list-curl.sh   (GNU coreutils)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${SILAS_API_URL:-https://silas-content-system-production.up.railway.app}/api/v1"
CLIENT_SLUG="${CLIENT_SLUG:-conny-gfrerer}"
ORG_SLUG="${ORG_SLUG:-test}"
LIST="${COMPETITOR_LIST:-$ROOT/competitor_list.md}"
LOG="${INGEST_LOG:-/tmp/silas-competitor-list-ingest.log}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

KEY="${TEST_ACCOUNT_API_KEY:-}"
if [[ -z "$KEY" && -f "$ROOT/.env" ]]; then
  KEY="$(grep '^TEST_ACCOUNT_API_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r' | head -1)"
fi
if [[ -z "$KEY" ]]; then
  echo "Set TEST_ACCOUNT_API_KEY or add it to $ROOT/.env" >&2
  exit 1
fi

exec >>"$LOG" 2>&1
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) start ==="
echo "API=$API CLIENT=$CLIENT_SLUG ORG=$ORG_SLUG LIST=$LIST"

tmp="$(mktemp)"
grep -oE 'https://www\.instagram\.com/(reel|reels|p|tv)/[^[:space:])"\]*' "$LIST" \
  | sed 's/[).,;]$//' \
  | sort -u >"$tmp"

urls=()
while IFS= read -r line || [[ -n "${line:-}" ]]; do
  [[ -z "${line:-}" ]] && continue
  urls+=("$line")
done <"$tmp"
rm -f "$tmp"

total="${#urls[@]}"
if [[ "$total" -eq 0 ]]; then
  echo "No Instagram URLs found in $LIST" >&2
  exit 1
fi

nbatch=$(( (total + 19) / 20 ))
echo "Unique URLs: $total batches: $nbatch (max 20 per batch)"

for ((i = 0; i < total; i += 20)); do
  slice=()
  for ((j = i; j < i + 20 && j < total; j++)); do
    slice+=("${urls[j]}")
  done
  bn=$((i / 20 + 1))
  echo ""
  echo "--- Batch $bn/$nbatch (${#slice[@]} urls) $(date -u +%H:%M:%SZ) ---"

  body="$(jq -n --args '{urls: $ARGS.positional, skip_apify: false}' -- "${slice[@]}")"

  resp="$(curl -sS -X POST "$API/clients/$CLIENT_SLUG/reels/analyze-bulk" \
    -H "X-Api-Key: $KEY" \
    -H "X-Org-Slug: $ORG_SLUG" \
    -H "Content-Type: application/json" \
    -d "$body")"

  job_id="$(echo "$resp" | jq -r '.job_id // empty')"
  if [[ -z "$job_id" || "$job_id" == "null" ]]; then
    echo "analyze-bulk failed: $resp"
    exit 1
  fi
  echo "job_id=$job_id polling…"

  deadline=$((SECONDS + 7200))
  while [[ $SECONDS -lt $deadline ]]; do
    jr="$(curl -sS "$API/jobs/$job_id" \
      -H "X-Api-Key: $KEY" \
      -H "X-Org-Slug: $ORG_SLUG")"
    st="$(echo "$jr" | jq -r '.status // empty')"
    if [[ "$st" == "completed" ]]; then
      echo "$jr" | jq '{status, result}'
      break
    fi
    if [[ "$st" == "failed" ]]; then
      echo "Job failed: $jr"
      exit 1
    fi
    sleep 5
  done
  if [[ $SECONDS -ge $deadline ]]; then
    echo "Timeout waiting for $job_id"
    exit 1
  fi
done

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) done ==="
