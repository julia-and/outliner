#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Deploy a debug build to Scaleway Object Storage.
# Same as deploy.sh but with VITE_DEXIE_DEBUG=true (enables Dexie.debug).
#
# Uses SCW_DEBUG_BUCKET if set, otherwise falls back to SCW_BUCKET.
# ---------------------------------------------------------------------------

: "${SCW_ACCESS_KEY:?Need SCW_ACCESS_KEY}"
: "${SCW_SECRET_KEY:?Need SCW_SECRET_KEY}"
: "${SCW_BUCKET:?Need SCW_BUCKET}"
: "${SCW_REGION:="${SCW_REGION:-fr-par}"}"

BUCKET="${SCW_DEBUG_BUCKET:-${SCW_BUCKET}}"
ENDPOINT="https://s3.${SCW_REGION}.scw.cloud"

export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY"
export AWS_DEFAULT_REGION="$SCW_REGION"

S3_URI="s3://${BUCKET}"
AWS="aws --endpoint-url $ENDPOINT"

echo "→ Building (debug)…"
VITE_DEXIE_DEBUG=true npm run build

echo "→ Uploading hashed assets (immutable, 1 year)…"
$AWS s3 sync dist/assets/ "$S3_URI/assets/" \
  --delete \
  --acl public-read \
  --cache-control "public, max-age=31536000, immutable" \
  --metadata-directive REPLACE

echo "→ Uploading remaining files (no-cache)…"
$AWS s3 sync dist/ "$S3_URI/" \
  --delete \
  --exclude "assets/*" \
  --acl public-read \
  --cache-control "no-cache, no-store, must-revalidate" \
  --metadata-directive REPLACE

echo "✓ Deployed (debug) → https://${BUCKET}.s3-website.${SCW_REGION}.scw.cloud"
