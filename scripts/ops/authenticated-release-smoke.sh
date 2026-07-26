#!/usr/bin/env bash
set -euo pipefail

RELEASE_ID="${1:?release ID required}"
: "${AGENT_PUBLIC_URL:?AGENT_PUBLIC_URL is required}"
: "${SYNTHETIC_ACCESS_TOKEN:?SYNTHETIC_ACCESS_TOKEN is required}"
: "${SYNTHETIC_RESOURCE_ID:?SYNTHETIC_RESOURCE_ID is required}"

BASE_URL="${AGENT_PUBLIC_URL%/}"
AUTH_HEADER="Authorization: Bearer $SYNTHETIC_ACCESS_TOKEN"
TEMP_DIR="$(mktemp -d)"
CHAT_BODY="$TEMP_DIR/chat-response.txt"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

curl --fail --silent --show-error \
  --max-time 30 \
  -H "$AUTH_HEADER" \
  "$BASE_URL/corpus-status" \
  | jq -e --arg release "$RELEASE_ID" \
      '.releaseId == $release and .documentCount > 0' >/dev/null

curl --fail --silent --show-error \
  --max-time 30 \
  "$BASE_URL/dependencyz" \
  | jq -e '.status == "ok"' >/dev/null

THREAD_ID="release-smoke-$RELEASE_ID"
QUESTION="${RELEASE_SMOKE_QUESTION:-What does EPSDT require?}"
PAYLOAD="$(jq -nc \
  --arg thread "$THREAD_ID" \
  --arg resource "$SYNTHETIC_RESOURCE_ID" \
  --arg question "$QUESTION" \
  '{
    messages: [{
      id: "release-smoke-question",
      role: "user",
      parts: [{type: "text", text: $question}]
    }],
    memory: {thread: $thread, resource: $resource}
  }')"

curl --fail --silent --show-error \
  --max-time "${RELEASE_SMOKE_TIMEOUT_SECONDS:-240}" \
  -H "$AUTH_HEADER" \
  -H 'content-type: application/json' \
  --data-binary "$PAYLOAD" \
  "$BASE_URL/chat" \
  > "$CHAT_BODY"

MIN_BYTES="${RELEASE_SMOKE_MIN_BYTES:-500}"
ACTUAL_BYTES="$(wc -c < "$CHAT_BODY" | tr -d ' ')"
[[ "$ACTUAL_BYTES" -ge "$MIN_BYTES" ]] || {
  echo "Authenticated smoke answer was too short: $ACTUAL_BYTES bytes" >&2
  exit 1
}
grep -Eiq 'source|citation|https?://' "$CHAT_BODY" || {
  echo "Authenticated smoke answer did not expose citation/source evidence" >&2
  exit 1
}

echo "Authenticated release smoke passed for $RELEASE_ID"
