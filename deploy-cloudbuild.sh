#!/usr/bin/env bash
# Deploys to Cloud Run without local Docker:
#  1. Cloud Build builds + pushes the image to Artifact Registry
#  2. `gcloud run deploy` deploys it (run from your own terminal so your
#     account does the deploy — no extra IAM grants needed)
#
# Prerequisites (run once):
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#   gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
#   gcloud artifacts repositories create badminton-club \
#     --repository-format=docker --location=us-east1
#
# Usage:
#   ./deploy-cloudbuild.sh
set -euo pipefail

REGION="${REGION:-us-east1}"
REPO="${REPO:-badminton-club}"
PROJECT="$(gcloud config get-value project)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "No gcloud project set. Run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "Missing .env.local — copy .env.example and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

SHA="$(git rev-parse --short HEAD)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/badminton-club:$SHA"

SUB="_NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY"
SUB="$SUB,_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
SUB="$SUB,_NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID"
SUB="$SUB,_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
SUB="$SUB,_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
SUB="$SUB,_NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID"
SUB="$SUB,_NEXT_PUBLIC_CURRENCY=${NEXT_PUBLIC_CURRENCY:-DKK}"
SUB="$SUB,_COMMIT_SHA=$SHA"

echo "Building + pushing $IMAGE"
gcloud builds submit --config=cloudbuild.push.yaml --substitutions="$SUB" .

echo "Deploying to Cloud Run ($REGION)"
gcloud run deploy badminton-club \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --cpu-throttling \
  --set-env-vars "ADMIN_EMAILS=${ADMIN_EMAILS:-}"

echo "Deployed. Promote your first admin in the Firestore console if not done yet."
