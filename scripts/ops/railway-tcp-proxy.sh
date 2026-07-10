#!/usr/bin/env bash
# Toggle the production Neo4j TCP proxy programmatically (the CLI has no
# proxy commands; these are the same GraphQL mutations the Railway dashboard
# and MCP use). The proxy exposes bolt publicly — create it only for the
# duration of a deploy-data run and delete it immediately after.
#
# Usage:
#   scripts/ops/railway-tcp-proxy.sh create   → prints "host:port" on stdout
#   scripts/ops/railway-tcp-proxy.sh delete   → removes ALL proxies on the service
#   scripts/ops/railway-tcp-proxy.sh list     → prints existing proxies
#
# Auth: RAILWAY_ACCESS_TOKEN from ops.env if set, else the CLI session token
# from ~/.railway/config.json (.user.accessToken).

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

GQL_URL="https://backboard.railway.com/graphql/v2"
ENVIRONMENT_ID="${RAILWAY_ENV_ID:-1c44225d-3afb-4c5f-b4e1-ea2b93dbbd9d}"   # production
NEO4J_SERVICE_ID="${RAILWAY_NEO4J_SERVICE_ID:-1de48388-d6f6-4687-ad6c-9bb57c15983c}"

token() {
  if [[ -n "${RAILWAY_ACCESS_TOKEN:-}" ]]; then
    printf '%s' "$RAILWAY_ACCESS_TOKEN"
  else
    jq -re '.user.accessToken' "$HOME/.railway/config.json" \
      || { log "no Railway token: set RAILWAY_ACCESS_TOKEN in ops.env or run 'railway login'"; return 1; }
  fi
}

gql() {
  local body="$1"
  curl -fsS -m 30 "$GQL_URL" \
    -H "Authorization: Bearer $(token)" \
    -H "Content-Type: application/json" \
    -d "$body"
}

list_proxies() {
  gql "$(jq -nc --arg e "$ENVIRONMENT_ID" --arg s "$NEO4J_SERVICE_ID" \
    '{query: "query($e: String!, $s: String!) { tcpProxies(environmentId: $e, serviceId: $s) { id domain proxyPort applicationPort } }", variables: {e: $e, s: $s}}')"
}

case "${1:-}" in
  create)
    RESP="$(gql "$(jq -nc --arg e "$ENVIRONMENT_ID" --arg s "$NEO4J_SERVICE_ID" \
      '{query: "mutation($i: TCPProxyCreateInput!) { tcpProxyCreate(input: $i) { id domain proxyPort } }", variables: {i: {environmentId: $e, serviceId: $s, applicationPort: 7687}}}')")"
    DOMAIN="$(jq -re '.data.tcpProxyCreate.domain' <<<"$RESP")" || { log "tcpProxyCreate failed: $RESP"; exit 1; }
    PORT="$(jq -re '.data.tcpProxyCreate.proxyPort' <<<"$RESP")"
    # The API returns the domain with a trailing dot — strip it.
    printf '%s:%s\n' "${DOMAIN%.}" "$PORT"
    ;;
  delete)
    LIST_RESP="$(list_proxies)"
    # GraphQL errors arrive with HTTP 200 — an errored list must NOT read as
    # "nothing to delete" or a failed cleanup exits green with bolt exposed.
    jq -e '.data.tcpProxies != null' <<<"$LIST_RESP" >/dev/null \
      || { log "tcpProxies query failed: $LIST_RESP"; exit 1; }
    IDS="$(jq -r '.data.tcpProxies[].id' <<<"$LIST_RESP")"
    if [[ -z "$IDS" ]]; then
      log "no proxies to delete"
      exit 0
    fi
    while read -r id; do
      [[ -z "$id" ]] && continue
      OK="$(gql "$(jq -nc --arg id "$id" '{query: "mutation($id: String!) { tcpProxyDelete(id: $id) }", variables: {id: $id}}')" | jq -r '.data.tcpProxyDelete')"
      log "deleted proxy $id → $OK"
      [[ "$OK" == "true" ]] || exit 1
    done <<<"$IDS"
    # Post-check: deletion must actually have taken (and the check itself
    # must have succeeded).
    POST_RESP="$(list_proxies)"
    jq -e '.data.tcpProxies != null' <<<"$POST_RESP" >/dev/null \
      || { log "post-delete tcpProxies query failed: $POST_RESP"; exit 1; }
    REMAINING="$(jq '.data.tcpProxies | length' <<<"$POST_RESP")"
    if [[ "$REMAINING" != "0" ]]; then
      log "ERROR: $REMAINING proxy(ies) still present after delete"
      exit 1
    fi
    ;;
  list)
    list_proxies | jq '.data.tcpProxies'
    ;;
  *)
    echo "Usage: $0 {create|delete|list}" >&2
    exit 2
    ;;
esac
