<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Badminton Club — project conventions

Mobile-first badminton club app (Next.js 16 + TypeScript + Tailwind v4) running on
Google Cloud **free tier**: one Cloud Run service, Firestore, Firebase Auth, Cloud
Storage. No SQL database. Aim to stay within free-tier limits (2M requests/month
Cloud Run, 50k reads / 20k writes per day Firestore, 50k MAU Firebase Auth).

## Environment (deployed)

- Project: `social-badminton`; **everything in `us-east1`** (Firestore location is
  permanent and cannot be changed; Storage free tier only applies in
  us-east1/us-west1/us-central1).
- Live URL: `https://badminton-club-913032121581.us-east1.run.app`
- Local env: `.env.local` (gitignored, from `.env.example`) holds the
  `NEXT_PUBLIC_FIREBASE_*` web config and `NEXT_PUBLIC_CURRENCY=DKK`.

## Commands

- `npm run dev` — dev server (WSL note: use `node.exe`, not `node`, on PATH)
- `npm run build` — production build (standalone output for Cloud Run)
- `npm run lint` — ESLint (react-hooks/set-state-in-effect is strict: no sync
  setState inside effects; call setState in async callbacks/then chains instead)
- `npm run typecheck` — `tsc --noEmit`

## Architecture at a glance

- **Auth**: Firebase Auth (Google SSO + email/password). `components/AuthProvider.tsx`
  exposes `user`, `userData`, `loading`, `isAdmin`, `needsProfile`.
- **Most data ops are CLIENT-SIDE** with enforcement in `firestore.rules`
  (roles, capacity, ratings). Only `app/api/bootstrap` and the optional admin API
  routes use `firebase-admin` (requires a service account; optional).
- **Lazy SDK init**: `lib/firebase.ts` never initializes at module top-level; call
  `getFirebaseApp()`/`getDb()` inside hooks/handlers so `next build` prerendering works.
- **Firestore collections** (`lib/types.ts`):
  - `users/{uid}` — `nickname`, `photoUrl`, `role` (`member`|`admin`), `email`
  - `sessions/{id}` — `title`, `day`, `time`, `location`, `capacity`, `count`,
    `cost` (total, optional), `playersOverride` (optional, overrides player count
    for cost splitting); `sessions/{id}/registrations/{uid}` subcollection
  - `ratings/{ratedUid}_{raterUid}` — `stars` 1–5
  - `sessions/{id}/matches/{matchId}` — reserved for future match results
- **Registration** uses a client `runTransaction` (write registration + `increment`
  session `count`) with rules checking capacity.
- **Costs**: `lib/payments.ts` — `perPlayerCost = cost / (playersOverride ?? count)`;
  currency is `NEXT_PUBLIC_CURRENCY` (default `DKK`).

## Resource usage patterns (preserve these)

The app is deliberately tuned to stay inside the Firestore free tier. Don't
regress these:

- **`lib/useWhenVisible.ts`** — wraps every `onSnapshot` so the subscription is
  torn down while the browser tab is hidden. Any new real-time listener must use
  it (pass a `useCallback`'d subscribe function; it resubscribes on visibility).
- **Leaderboard** (`RankingClient` + `fetchLeaderboard`): data is cached 60s per
  rater in `lib/db.ts` (`LEADERBOARD_TTL_MS`). Rating a player recomputes that
  row locally (`applyRating`) and calls `invalidateLeaderboardCache()` — there is
  **no refetch after rating and no polling** (polling would blow the read budget).
- **Session registrations** (`SessionsView`): ONE live `onSnapshot` on `sessions`;
  a session's registrations are fetched once with `getDocs` only when its `count`
  changes (tracked via `countsRef`). Avoid adding a per-session listener loop.
- Reads/writes are already batched and denormalized (registration embeds
  nickname/photoUrl so users aren't re-read on Home).

## Code style

- Feature-based folders under `components/` (`home/`, `ranking/`, `admin/`).
- Shared small UI in `components/` root (`Avatar`, `StarRating`, `Spinner`...).
- Use the `cn()` helper (`lib/cn.ts`) for conditional Tailwind classes.
- Use `Avatar` for photos (never raw `<img>` without a good reason).
- No comments unless they add real value; follow existing patterns.
- Client components that gate on auth redirect with `router.replace` in a
  `useEffect`, never during render.

## Deploy (free tier)

- **Recommended: `./deploy-cloudbuild.sh`** — no Docker needed; Cloud Build
  (2,500 min/mo free) builds + pushes to Artifact Registry, then deploys Cloud Run
  from your own gcloud account. Reads `.env.local`; run from the repo root.
  Do NOT change it back to relying on `${SHORT_SHA}` in `cloudbuild.push.yaml` —
  that built-in only exists for repo-triggered builds; the script passes
  `_COMMIT_SHA` explicitly.
- `./deploy.sh` — same but via local Docker (requires Docker installed).
- Keep `min-instances=0`, `max-instances=2`, CPU throttling (costs $0 when idle).
- **Rules deploy: `./deploy-rules.sh --project <id>`** (Firebase CLI;
  `gcloud firestore rules` no longer exists in recent gcloud). `firebase.json`
  wires `firestore.rules` + indexes + `storage.rules`.
- **First admin**: set `role: "admin"` on a user doc in the Firestore console (or
  `POST /api/bootstrap` with `ADMIN_EMAILS` set + a service account).
- Platform facts: Firebase Storage requires the **Blaze plan** (card on file, still
  $0 inside free tier). Firestore database location is immutable.

## Future feature notes

- **Match results**: collection `sessions/{id}/matches/{matchId}` is already
  permitted in `firestore.rules` and reserved in `lib/types.ts`. Record
  `{ team1: [uid,uid], team2: [uid,uid], score, recordedBy }`, extend the ranking
  aggregation, and add a `components/matches/` + `app/matches/` route.
- New collections need a matching rule block + type; keep subcollections under
  their parent so reads stay grouped.
