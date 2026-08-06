# Social Badminton Club

A badminton club management app — sessions, sign-ups, skill rankings and admin
management — built to run entirely inside the **Google Cloud Free Tier**.

## Stack

| Piece            | Product                | Free tier covers                          |
| ---------------- | ---------------------- | ----------------------------------------- |
| App + backend    | Cloud Run (1 service)  | 2M requests/month, scales to zero         |
| Database         | Firestore              | 50k reads / 20k writes / 20k deletes a day |
| Auth             | Firebase Auth (Spark)  | 50k monthly active users (Google + email) |
| Photos           | Cloud Storage          | 5 GB, 5k/50k ops                          |
| Build & deploy   | Cloud Build + Artifact Registry | 2,500 min/month, 0.5 GB          |

A small club (dozens of members) uses well under 1% of these limits. Avoid
Cloud SQL (no always-free tier) — this app is NoSQL end-to-end.

## Pages

- **Home** — public landing + CTA when signed out; when signed in: your
  profile (nickname + photo, editable) and the session list (who's signed up,
  slots left, day/time, location).
- **Ranking** — rate any other player 1–5 stars; leaderboard shows average,
  number of ratings, and your own rating per player.
- **Admin** — promote/demote admins, add/edit/delete sessions, remove players
  from a session. Visible only to users with role `admin` (default: `member`).

## Project layout

```
app/
  page.tsx                  Home (public / signed-in)
  login/page.tsx            Google SSO + email/password
  ranking/page.tsx          Ranked leaderboard
  admin/page.tsx            Admin panel
  manifest.ts               PWA manifest
  api/
    bootstrap/              Promote the first admin (server-only)
    sessions/...            Optional REST-ish admin API (future native app seam)
components/
  AuthProvider.tsx          Auth + user profile state
  home/ ...                 Profile card, session list/card
  ranking/RankingClient.tsx
  admin/AdminUsers|AdminSessions.tsx
lib/
  firebase.ts               Client SDK (lazy init)
  firebase-admin.ts         Server SDK (guarded)
  db.ts                     Firestore/storage helpers + transactions
firestore.rules             Data access rules (roles enforced here)
storage.rules               Profile photo rules
Dockerfile, cloudbuild.yaml, deploy.sh
```

## Getting started

1. **Create a Firebase project** at <https://console.firebase.google.com>.
   - Enable **Authentication** → sign-in methods → enable **Google** and
     **Email/Password**.
   - Enable **Firestore Database** (production mode) and **Storage**.
   - Add a **Web app** and copy its SDK config.
2. **Configure the app**:

   ```bash
   cp .env.example .env.local   # fill in the NEXT_PUBLIC_FIREBASE_* values
   npm install
   npm run dev                  # http://localhost:3000
   ```

3. **Deploy rules** (one-time, via the Firebase CLI — `gcloud firestore rules` was
   removed from newer gcloud versions):

   ```bash
   npx --yes firebase-tools login
   ./deploy-rules.sh --project YOUR_PROJECT_ID
   # or manually: npx firebase-tools deploy --only firestore:rules,storage --project YOUR_PROJECT_ID
   ```

   This publishes `firestore.rules` + indexes and `storage.rules` (configured in
   `firebase.json`). Note: Storage rules deploy needs the Storage bucket to exist
   (Blaze plan). To deploy just the Firestore rules first, use
   `--only firestore:rules`.

4. **Create the first admin.** Everyone signs up as `member`, and rules prevent
   self-promotion. After at least one admin email has signed in once, either:
   - call `POST /api/bootstrap` with `ADMIN_EMAILS` set (needs the server SDK
     configured), or
   - edit that user's `role` field in the Firestore console to `admin` once.

## Deploying to Cloud Run (free tier)

Two options:

- **Cloud Build — no Docker needed (recommended here)**:

  ```bash
  gcloud auth login
  gcloud config set project YOUR_PROJECT_ID
  gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
  gcloud artifacts repositories create badminton-club --repository-format=docker --location=us-east1
  ./deploy-cloudbuild.sh      # reads .env.local, builds in Google's cloud, deploys
  ```

- **Local Docker** (uses your own machine, needs Docker installed):

  ```bash
  ./deploy.sh   # requires gcloud auth + docker; reads .env.local
  ```

Keep the service on `min-instances=0` and `max-instances=2` so it costs
nothing when idle and never scales up beyond need.

> **Note:** the `NEXT_PUBLIC_*` Firebase web config is baked into the client at
> build time. Cloud Run only needs `ADMIN_EMAILS` at runtime for the bootstrap
> route; everything else is enforced client-side by Firestore rules.

## Adding new features (e.g. match results)

Firestore is schema-less, so a new feature is a new collection/subcollection —
no migrations. The `matches` subcollection is already permitted in
`firestore.rules` (`/sessions/{sessionId}/matches/{matchId}`). A typical flow:

1. Record a result: write `{ team1: [uid,uid], team2: [uid,uid], score, recordedBy }`.
2. Extend the ranking query to also aggregate wins/losses from `matches`.
3. Add a `components/matches/` folder + `app/matches/` route. No changes to
   existing pages required.

Keep these habits to stay inside the free tier: prefer **subcollections**,
**batch writes** for multi-doc changes, and **aggregation queries**
(`count`/`sum`) instead of pulling whole collections.
