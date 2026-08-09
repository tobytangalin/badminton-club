#!/usr/bin/env bash
# Deploys Firestore rules + indexes and Storage security rules via the Firebase CLI.
#
# First time:
#   npx firebase-tools login
#
# Usage:
#   ./deploy-rules.sh --project <project-id>
set -euo pipefail

npx --yes firebase-tools deploy --only firestore:rules,firestore:indexes,storage "$@"
