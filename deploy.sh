# Deploys the app to Cloud Run via Docker (no Cloud Build needed).
#
# Prerequisites:
#   gcloud auth login && gcloud config set project YOUR_PROJECT_ID
#   gcloud services enable run.googleapis.com artifactregistry.googleapis.com
#   gcloud artifacts repositories create badminton-club \
#     --repository-format=docker --location=us-east1
#
# Usage:
#   ./deploy.sh
#
# After the first deploy, create the first admin either by:
#   1. editing that user's "role" to "admin" in the Firestore console, or
#   2. deploying with the server SDK (Workload Identity / service account) and
#      calling POST /api/bootstrap with ADMIN_EMAILS set.

set -euo pipefail

REGION="${REGION:-us-east1}"
REPO="${REPO:-badminton-club}"
IMAGE="$REGION-docker.pkg.dev/$(gcloud config get-value project)/$REPO/badminton-club"

# Load build-time web config from .env.local (NEXT_PUBLIC_* values).
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
else
  echo "Missing .env.local — copy .env.example and fill it in." >&2
  exit 1
fi

echo "Building $IMAGE"
docker build \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY="$NEXT_PUBLIC_FIREBASE_API_KEY" \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID="$NEXT_PUBLIC_FIREBASE_PROJECT_ID" \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID="$NEXT_PUBLIC_FIREBASE_APP_ID" \
  --build-arg NEXT_PUBLIC_CURRENCY="${NEXT_PUBLIC_CURRENCY:-DKK}" \
  -t "$IMAGE" .

echo "Pushing $IMAGE"
docker push "$IMAGE"

echo "Deploying to Cloud Run"
gcloud run deploy badminton-club \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --cpu-throttling \
  --set-env-vars "ADMIN_EMAILS=${ADMIN_EMAILS:-}"

echo "Done. One-time setup still required:"
echo "  ./deploy-rules.sh --project \$(gcloud config get-value project)"
echo "  Promote your first admin in the Firestore console (users/<uid>/role -> admin)."
