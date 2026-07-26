#!/usr/bin/env bash
# Shared Railway Object Storage helpers. Source this file; do not execute it.

set -euo pipefail

configure_release_remote() {
  : "${BUCKET:?Railway Object Storage BUCKET is required}"
  : "${ACCESS_KEY_ID:?Railway Object Storage ACCESS_KEY_ID is required}"
  : "${SECRET_ACCESS_KEY:?Railway Object Storage SECRET_ACCESS_KEY is required}"
  : "${ENDPOINT:?Railway Object Storage ENDPOINT is required}"

  export RCLONE_CONFIG_RELEASE_TYPE=s3
  export RCLONE_CONFIG_RELEASE_PROVIDER=Other
  export RCLONE_CONFIG_RELEASE_ACCESS_KEY_ID="$ACCESS_KEY_ID"
  export RCLONE_CONFIG_RELEASE_SECRET_ACCESS_KEY="$SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_RELEASE_ENDPOINT="$ENDPOINT"
  export RCLONE_CONFIG_RELEASE_REGION="${REGION:-auto}"
  export RCLONE_CONFIG_RELEASE_FORCE_PATH_STYLE="${OBJECT_STORAGE_FORCE_PATH_STYLE:-false}"
}

release_object_path() {
  printf 'release:%s/%s' "${BUCKET:?}" "$1"
}
