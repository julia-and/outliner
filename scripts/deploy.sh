#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Deploy to Scaleway Object Storage (S3-compatible)
#
# Prerequisites:
#   - AWS CLI installed (brew install awscli  /  pip install awscli)
#   - Environment variables set:
#       SCW_ACCESS_KEY   – Scaleway access key ID
#       SCW_SECRET_KEY   – Scaleway secret key
#       SCW_BUCKET       – bucket name (e.g. "my-app")
#       SCW_REGION       – Scaleway region (e.g. "fr-par", "nl-ams", "pl-waw")
#
# Usage:
#   SCW_ACCESS_KEY=... SCW_SECRET_KEY=... SCW_BUCKET=... SCW_REGION=... ./deploy.sh
#   or export the vars in your shell / .env and just run ./deploy.sh
# ---------------------------------------------------------------------------

: "${SCW_ACCESS_KEY:?Need SCW_ACCESS_KEY}"
: "${SCW_SECRET_KEY:?Need SCW_SECRET_KEY}"
: "${SCW_BUCKET:?Need SCW_BUCKET}"
: "${SCW_REGION:="${SCW_REGION:-fr-par}"}"

ENDPOINT="https://s3.${SCW_REGION}.scw.cloud"

export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY"
export AWS_DEFAULT_REGION="$SCW_REGION"

S3_URI="s3://${SCW_BUCKET}"
AWS="aws --endpoint-url $ENDPOINT"

echo "→ Building…"
npm run build

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

echo "✓ Deployed → https://${SCW_BUCKET}.s3-website.${SCW_REGION}.scw.cloud"
