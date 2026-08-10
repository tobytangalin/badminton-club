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
  exposes `user`, `userData`, `loading`, `isAdmin`, `isApproved`, `needsProfile`.
  New accounts are **pending approval** until an admin approves them (`users/{uid}`
  `approved: false`; legacy docs without the field count as approved). Pending
  users see a waiting card on Home instead of sessions, are redirected off
  `/members`, and are blocked by `firestore.rules` (registrations, waitlist,
  ratings, self-update can't flip `approved`). Admins approve via `AdminUsers`
  (Approve button); the Home page updates live because `AuthProvider` subscribes
  to the user doc. Admins see a "N members awaiting approval" banner on Home
  (`PendingUsersBanner` in `HomeContent`) — it's a **one-shot `getDocs` query**
  (`where approved == false`, re-run on tab focus via `useWhenVisible`), NOT a
  listener, so it only reads pending docs; it links to `/admin?tab=users`, which
  `AdminPanel` reads to open the Users tab. The `/login`
  page has an inline password-reset flow (`sendPasswordResetEmail`) that shows a
  generic success message to avoid account enumeration.
- **Most data ops are CLIENT-SIDE** with enforcement in `firestore.rules`
  (roles, capacity, ratings). Only `app/api/bootstrap`, the optional admin API
  routes, and `app/api/admin/users/[uid]` (DELETE — deletes an auth account +
  Firestore data; used for both admin-deletes-user and member-deletes-self)
  use `firebase-admin` (requires a service account; optional). Locally the admin
  API returns 401 `Unauthorized` unless `GOOGLE_APPLICATION_CREDENTIALS` points
  at a service-account JSON key (set in `.env.local`, Windows path since the dev
  server runs under `node.exe`; needs Firestore + Firebase Auth Admin roles);
  deployed Cloud Run uses Workload Identity. Admins delete
  users from `AdminUsers`; members delete themselves from `ProfileCard`
  (Edit → "Delete account" → type their nickname to confirm). The delete route
  only decrements a session's count if the session doc still exists — orphaned
  registrations from previously deleted sessions are cleaned up regardless. It
  also deletes the user's `waitlist` docs and decrements `waitlistCount`.
- **Lazy SDK init**: `lib/firebase.ts` never initializes at module top-level; call
  `getFirebaseApp()`/`getDb()` inside hooks/handlers so `next build` prerendering works.
- **Firestore collections** (`lib/types.ts`):
  - `users/{uid}` — `nickname`, `photoUrl`, `role` (`member`|`admin`), `email`,
    `approved` (optional; absent/true = approved, new accounts start `false`)
  - `sessions/{id}` — `date` (ISO `YYYY-MM-DD`), `startTime`, `endTime`,
    `location`, `capacity` (optional; null/absent = no limit), `count`,
    `waitlistCount` (optional; 0 when absent), `cost` (total, optional),
    `playersOverride` (optional, overrides player count for cost splitting),
    `description` (optional, shown to members, max 500 chars);
    `sessions/{id}/registrations/{uid}` and
    `sessions/{id}/waitlist/{uid}` subcollections
  - `ratings/{ratedUid}_{raterUid}` — `stars` 1–5
  - `sessions/{id}/matches/{matchId}` — reserved for future match results
- **Registration** uses a client `runTransaction` (write registration + `increment`
  session `count`) with rules checking capacity. Admins can also add/remove members
  from a session via the "Manage participants" checkbox picker in `AdminSessions`
  (`adminAddRegistration` in `lib/db.ts`); this bypasses capacity so a session can
  be overfull. Registration create in `firestore.rules` allows `isAdmin() || isSelf(uid)`.
- **Waitlist**: when a capped session is full, `SessionCard` offers "Join waitlist"
  (`joinWaitlist` in `lib/db.ts` writes a `waitlist` subcollection doc + `increment`
  `waitlistCount`; rules only allow it when the session is actually full). On
  unregister, `unregisterFromSession` **auto-promotes** the oldest waitlisted member
  into the freed spot in the same transaction (deletes their waitlist doc, writes
  their registration, decrements both counts) — no polling, no manual admin step.
  Waitlisted users see their queue position and can leave; `adminAddRegistration`
  clears a stale waitlist doc if an admin adds someone directly. Sessions store
  `waitlistCount: 0` at creation. **Rules gotcha**: `request.resource.data` for an
  update is the FULL merged post-update document, not just the written fields — so
  the sessions `allow update` (`isMemberSessionUpdate`) compares `count`/`waitlistCount`
  deltas against `resource.data` via absent-aware `countOf`/`waitlistCountOf` helpers.
  Never use `!('field' in request.resource.data)` to detect "field not written" in an
  update rule.
- **Costs**: `lib/payments.ts` — `perPlayerCost = cost / (playersOverride ?? count)`;
  currency is `NEXT_PUBLIC_CURRENCY` (default `DKK`).
- **Dates**: sessions store ISO `date` + 24h `startTime`/`endTime`.
  `lib/date.ts` has `formatSessionDate` ("Sunday, August 9") and `isSessionEnded`
  (Home hides ended sessions; Admin splits the list into Upcoming/Past).
  `normalizeSession` maps **legacy session docs** (old `title`/`day`/`time`
  schema) onto the new fields — always normalize when mapping session snapshots,
  or `date.localeCompare` crashes on undefined.
- **Admin sessions** (`AdminSessions`): the add form only shows date, from/to
  times, location, an optional description, and capacity. `cost` and
  `playersOverride` ("how many joined") appear only while editing (they can't be
  known until the session happens). The
  list is split into Upcoming and a collapsible Past section; `AdminPanel`
  defaults to the Sessions tab. Each session's player list is capped at 8 with a
  "Show all" toggle; "Manage participants" opens a searchable checkbox picker
  (add/remove in bulk, applies via `adminAddRegistration`/`unregisterFromSession`).
  "Copy settings" pre-fills the Add form with a session's date/times/location/
  capacity (cost and playersOverride stay empty) to create a new session. The
  form validates: new sessions can't be dated in the past (date `min` + submit
  check) and end time must be after start time; editing past sessions is allowed
  so cost/playersOverride can be added after a session happens. Deleting a
  session cascades: `deleteSession` batch-deletes its registrations + the
  session doc (so registrations aren't orphaned).

## Resource usage patterns (preserve these)

The app is deliberately tuned to stay inside the Firestore free tier. Don't
regress these:

- **`lib/useWhenVisible.ts`** — wraps every `onSnapshot` so the subscription is
  torn down while the browser tab is hidden. Any new real-time listener must use
  it (pass a `useCallback`'d subscribe function; it resubscribes on visibility).
- **Leaderboard** (`MembersClient` + `fetchLeaderboard`): data is cached 60s per
  rater in `lib/db.ts` (`LEADERBOARD_TTL_MS`). Rating a player recomputes that
  row locally (`applyRating`) and calls `invalidateLeaderboardCache()` — there is
  **no refetch after rating and no polling** (polling would blow the read budget).
  The Members page renders as cards on mobile and a `table-fixed` table on
  desktop — keep it that way so the page **never shows a horizontal scrollbar**.
  Mobile shows Name / Power level sort pills in the list header (shared sort
  state with the desktop table).
- **Session registrations** (`SessionsView`): ONE live `onSnapshot` on `sessions`;
  a session's registrations are fetched once with `getDocs` only when its `count`
  changes (tracked via `countsRef`), and its waitlist members only when
  `waitlistCount` changes. Avoid adding a per-session listener loop.
- Reads/writes are already batched and denormalized (registration embeds
  nickname/photoUrl so users aren't re-read on Home).
- **Public images** (homepage hero, logo, committee photos) live in Firebase
  Storage under `landing/` and `committee/` (public read in `storage.rules`) and
  are served as WebP with `Cache-Control: public, max-age=31536000, immutable`.
  Optimize any new image this way (resize to needed size, WebP) and never hotlink
  Google Sites `lh3.googleusercontent.com` URLs (they 403).
- **Avatar uploads** (`lib/image.ts` + `ProfileCard`): resized client-side to a
  256px square WebP before `uploadBytes` — keeps a 200-member Members page load
  to a few MB. Google SSO photos are already tiny (`=s96-c`) and hosted on
  Google's CDN, so they're stored/used as-is.
- **Saved admin locations** (`lib/locations.ts`): kept in the browser's
  `localStorage` (no Firestore cost). The admin form offers tappable chips plus
  native `datalist` autocomplete, and a Save button next to the location field.
- **Service worker** (`public/sw.js`, PWA): navigations are **network-first** so a
  fresh deploy's HTML always wins (caching HTML stale-first served old chunk names
  after redeploys, causing 404s). Only `_next/static/*` is cache-first — those
  files are content-hashed and immutable. Call `response.clone()` synchronously
  when the fetch resolves, never after `caches.open()` resolves (the body is
  already consumed). Bump `CACHE_NAME` when changing caching behavior so the old
  cache is purged on activate.

## Routes & nav

- Public pages: `/` (home), `/committee`. Signed-in only: `/members`, `/admin`.
  `components/Nav.tsx` shows Members/Admin links only when signed in
  (`primaryLinks` for members+admins, `memberLinks` for guests, Admin appended
  for admins); the mobile bottom bar renders only for signed-in users.

## Code style

- Feature-based folders under `components/` (`home/`, `members/`, `admin/`).
- Shared small UI in `components/` root (`Avatar`, `StarRating`, `Spinner`...).
- Use the `cn()` helper (`lib/cn.ts`) for conditional Tailwind classes.
- Use `Avatar` for photos. Raw `<img>` is allowed for already-optimized assets
  (WebP from Firebase Storage, tiny local icons) — tag each with an
  `eslint-disable-next-line @next/next/no-img-element` + reason so future
  unoptimized images are still caught.
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
- **Rules + indexes deploy: `./deploy-rules.sh --project <id>`** (Firebase CLI;
  `gcloud firestore rules` no longer exists in recent gcloud). Deploys
  `firestore.rules`, `firestore.indexes`, and `storage.rules`.
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
- Collection-group single-field indexes go in `firestore.indexes.json` under
  `fieldOverrides` (exemptions) with `queryScope: COLLECTION_GROUP` — a plain
  `indexes` entry is rejected by the CLI ("not necessary, configure using single
  field index controls"). Example: the `registrations.uid` and `waitlist.uid`
  collection-group indexes used by admin user deletion (`app/api/admin/users/[uid]`).
