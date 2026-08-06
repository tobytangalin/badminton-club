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
  routes use `firebase-admin`.
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

## Code style

- Feature-based folders under `components/` (`home/`, `ranking/`, `admin/`).
- Shared small UI in `components/` root (`Avatar`, `StarRating`, `Spinner`...).
- Use the `cn()` helper (`lib/cn.ts`) for conditional Tailwind classes.
- Use `Avatar` for photos (never raw `<img>` without a good reason).
- No comments unless they add real value; follow existing patterns.
- Client components that gate on auth redirect with `router.replace` in a
  `useEffect`, never during render.

## Deploy (free tier)

- `./deploy.sh` (local Docker → Cloud Run) or `cloudbuild.yaml` (CI). Keep
  `min-instances=0`, `max-instances=2`, CPU throttling.
- Rules deploy: `./deploy-rules.sh --project <id>` (Firebase CLI; `gcloud firestore rules` no longer exists in recent gcloud).
- First admin: set the role manually in the Firestore console (or
  `POST /api/bootstrap` with `ADMIN_EMAILS` set).
- Build-time envs are the `NEXT_PUBLIC_FIREBASE_*` vars (see `.env.example`).
