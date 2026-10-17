# Arcade authentication and score service

## Hosting decision

The existing repository is a static site, served by the Git-linked Cloudflare Pages project `the420lobby-com`, with no build command and `.` as its output directory. The implementation retains Cloudflare Pages and all existing community, Minecraft, and Dank Cinema content. Cloudflare Pages Functions add a same-origin backend; Cloudflare D1 stores sessions, run records, scores, and achievements. This avoids moving the website to a new host or adding a frontend framework merely to support authentication.

`functions/[[path]].js` delegates to small modules in `functions/_lib/`. `_routes.json` invokes Functions for `/auth/*`, `/api/*`, and game scripts. All other marketing pages and artwork remain static. `shared/arcade-rules.mjs` runs the same versioned deterministic rules in the game clients and on the server. `migrations/0001_arcade.sql` defines the D1 schema and indexes.

The proposed release changes the build command to `node scripts/build-static.mjs` and the static output directory to `dist`. The build copies an explicit list of browser assets; backend source, database migrations, tests, documentation, local variables, and secrets never enter the static output. This isolation is necessary now that server configuration and credentials coexist with the original static site. `.gitignore` alone is not a publication boundary. No live hosting configuration has been changed.

No hosting settings, production bindings, Discord applications, DNS records, or deployments have been changed by this implementation. The deployment configuration intentionally omits the D1 binding and leaves the Discord application ID empty until real Cloudflare/Discord resources are configured. The backend fails closed until configured; a dummy D1 ID must not enter a deployed Wrangler configuration.

## Discord and session security

- The OAuth authorization-code exchange happens only inside a Pages Function, with the Discord client secret supplied by an encrypted server environment binding. Only the `identify` scope is requested. No bot token, email address, guild membership, or Discord role access is needed.
- OAuth state and a separate browser-binding token each contain 256 random bits. D1 holds only their SHA-256 hashes. State expires after ten minutes and is atomically consumed once. The browser token is an HttpOnly, Secure, SameSite=Lax, host-only cookie. Browser binding prevents an attacker from completing their own Discord authorization in a victim's browser.
- Successful sign-in creates a fresh, opaque, 256-bit session cookie and replaces an existing browser session. D1 stores only the token hash. The cookie is HttpOnly, Secure, SameSite=Lax, host-only, and expires after seven days. Logout deletes the server session and clears the cookie. Discord OAuth access tokens are discarded after the identity request; neither Discord tokens nor client secrets are stored in D1 or returned to browsers.
- Writes require an authenticated session, the exact configured same-origin `Origin`, and the session-specific `X-CSRF-Token` returned by `/api/session`. Cross-site fetches are rejected. OAuth callbacks instead use their one-use, browser-bound state. Sign-in from an alternate hostname first redirects to `SITE_ORIGIN`, so the browser state cookie and callback always use the same host.
- Usernames are bounded and stripped of control and bidirectional formatting characters. Avatar URLs are constructed from validated Discord IDs and avatar hashes, and only use Discord's CDN. The frontend renders names as text.
- Authenticated API responses and game scripts use `Cache-Control: no-store`; protected scripts also vary on Cookie. Game scripts are unavailable before authentication when served through Pages Functions. Scores and achievements cannot be submitted anonymously.

## Ranked scores

`POST /api/runs` issues a random challenge seed and a run ID bound to the player. Starting another round abandons the previous active round, including in other tabs. A database constraint enforces one active round per user. Runs expire after fifteen minutes, and starts/finishes have database-backed rate limits.

The client submits an input transcript and its elapsed time, never an authoritative total. The server replays the current rules from the stored seed, verifies timing against the server's start time, checks target existence and lifetimes, enforces cooldowns/pause limits, and calculates scores and achievements. Unknown fields, including client-provided score totals, are rejected. Request bodies, event counts, and finish times are bounded. A transactional update binds each accepted score to exactly one owned run. Identical retries return the stored result; altered retries, expired runs, foreign runs, and abandoned runs are rejected.

Leaderboards contain each player's highest score per game, with earlier verified submissions breaking ties. The weekly filter covers the preceding seven days. Usernames and avatars are public on leaderboards; no other Discord information is published. Profiles contain the signed-in player's persistent bests, totals, and earned achievements. Historical browser-only localStorage scores are not imported into ranked boards because they were never verified.

Deterministic replay rejects invalid scores and impossible actions. It does not establish that every valid input came from a human: seeds and rules are public, so a bot can generate legal play. There are no prizes, Discord roles, or real-world rewards attached to these rankings. Further bot mitigation can be evaluated if actual abuse occurs.

## API contracts

All endpoints are same-origin, return JSON unless redirecting, and use `{ "error": { "code": "...", "message": "..." } }` for errors. Game IDs are `sesh-signal`, `green-room-match`, and `bong-blitz`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/session` | `{user:null\|{id,username,avatarUrl}, csrfToken:null\|string, configured:boolean}` |
| `GET /auth/discord` | Redirects to Discord sign-in; fails closed if configuration is missing. |
| `GET /auth/callback` | Consumes state, exchanges the code server-side, creates a session, and redirects to `/arcade.html`. Cancellation/failure returns a short status query, without Discord response details. |
| `POST /auth/logout` | Requires Origin and CSRF; deletes the session and returns `{ok:true}`. |
| `GET /api/profile` | Requires sign-in; `{user,stats:{runs,totalScore,gamesPlayed},bests:[{game,score,playedAt}],achievements:[{id,unlockedAt}]}`. |
| `GET /api/leaderboards?game=...&period=all\|week` | `{game,period,entries:[{rank,user:{id,username,avatarUrl},score,playedAt}],updatedAt}`; at most fifty players. |
| `POST /api/runs` | Requires Origin/CSRF; accepts `{game}` and returns HTTP 201 `{id,game,seed,startedAt,expiresAt,durationMs,rulesVersion}`. |
| `POST /api/runs/:id/finish` | Requires Origin/CSRF; accepts `{events,elapsedMs}` and returns `{id,game,score,stats,achievements:[ids],best,isPersonalBest}`. |

Timestamps are integer Unix milliseconds, except transcript `at` and `elapsedMs`, which are milliseconds since the local round began, including pauses. Transcript action formats are defined in `shared/arcade-rules.mjs`. Accepted pauses/resumes appear in the transcript and stop active game time. `401` requires sign-in, `403` means Origin/CSRF failed, `409` means a run was replaced/already submitted, `410` means expired, `422` means replay verification failed, and `429` means rate limited.

## Local setup

Use Node 24 or newer for the SQLite-backed tests. Wrangler v4 supplies a local D1 emulator and the Pages Functions runtime; a simple static HTTP server cannot perform Discord login or secure score saves.

1. Create a Discord developer application for local development and register **exactly** `http://localhost:8788/auth/callback` in its OAuth2 redirect list.
2. Copy `.dev.vars.example` to `.dev.vars`, set that application's client ID/secret, and keep `SITE_ORIGIN=http://localhost:8788`. `.dev.vars` is ignored by Git. Never put a secret in JavaScript, HTML, `wrangler.jsonc`, a build variable exposed to clients, or a committed file.
3. First configure a real D1 database ID with the `DB` binding in your **local** Wrangler configuration (or provision a dedicated development database), then apply only the local migration and start Pages:

   ```sh
   npx wrangler@4 d1 migrations apply the420lobby-arcade --local
   node scripts/build-static.mjs
   npx wrangler@4 pages dev dist --port 8788
   ```

4. Open `http://localhost:8788/arcade.html` using that exact hostname. Visit Discord sign-in, play a full round, refresh, and confirm the persisted profile and leaderboard. Logout and confirm game scripts and run creation require sign-in again.

Automated validation, with no remote infrastructure or real Discord requests:

```sh
node tests/backend.test.mjs
node tests/arcade-rules.test.mjs
```

The backend suite uses SQLite with the actual migration and SQL statements, and mocked Discord responses. It covers OAuth state binding/replay/cancellation/expiry, HttpOnly session tokens, CSRF/Origin, logout, unauthenticated assets/runs, transcript validation, run ownership/expiry/abandonment, idempotency, persistence, and rate/body limits. Local emulator and real Discord acceptance should additionally verify provider/runtime behavior before production approval.

## Production setup and approval boundary

**Do not deploy, push to an auto-deploying branch, merge, apply remote migrations, or change the live Pages project without the user's approval.** The following are reviewable setup steps for the approved release, not actions already performed:

1. Create a D1 database named `the420lobby-arcade`; add a `d1_databases` entry to `wrangler.jsonc` with `binding: "DB"`, `database_name: "the420lobby-arcade"`, `database_id` set to the **real** ID, and `migrations_dir: "migrations"`. Review the schema, then apply `migrations/0001_arcade.sql` to that database. Never commit an all-zero or invented ID.
2. Set `SITE_ORIGIN` to the exact canonical website origin, currently `https://the420lobby.com`, and set `DISCORD_CLIENT_ID` to the production Discord application's public ID. Register **exactly** `https://the420lobby.com/auth/callback` in Discord. Use a dedicated production application if local/preview development has different operators.
3. Add `DISCORD_CLIENT_SECRET` as an **encrypted Pages Functions secret** for production. It is never a frontend build setting and must never be committed. Ensure the Pages D1 binding resolves to the intended production database. Change the approved Pages build command to `node scripts/build-static.mjs` and output directory to `dist`, matching `wrangler.jsonc`. The existing build-free/root-output Pages project does not obtain a build command from Wrangler; configure this in Cloudflare Pages settings. Without it, `dist` will not exist at deployment time. Publish only the build's explicitly staged assets; never upload the working directory or a directory containing `.dev.vars`, `.env`, backend source, or secret-bearing files.
4. Use an isolated D1 database, Discord application/redirect, and server secret for preview environments. Configure Wrangler's `env.preview` bindings/vars for a stable preview branch origin before enabling authenticated previews. Do not reuse production data or credentials in branch previews; unconfigured previews must remain signed out and fail closed.
5. Review the exact commit and run CI, local runtime checks, and desktop/mobile acceptance. After explicit deployment approval, release the approved commit through the existing Git-linked Pages workflow. No DNS change is required.
6. Verify the real callback, profile avatar/name, logout, refresh persistence, all three games, leaderboard rejection paths, and anonymous direct game-script access. If setup is incomplete, the UI should say sign-in is being connected and leave play disabled.

No browser configuration can create the Discord application or server secret automatically. Those values belong to the site owner's accounts. The repository intentionally contains no real Discord client secret.

## Data and maintenance

D1 stores a Discord ID, username, avatar URL, timestamped verified scores, achievement IDs, and hashed temporary/session tokens. IP addresses used for rate limiting are hashed with the operation/time-window key before storage; raw IPs are not saved in this database. Session and OAuth rows expire; login/start requests opportunistically remove expired temporary rows. Game transcripts are not stored after verification, only their hash and verified result. Scores and achievements persist until an authorized operator deletes them. For account erasure, delete the user's `users` row; foreign-key cascades remove sessions, runs, scores, and achievements.

Back up D1 before changing schemas or bulk-deleting scores. Update `RULES_VERSION` when scoring rules change so in-progress runs from an older release are rejected. Apply schema changes through numbered migrations. Existing static site rollback alone does not remove database records, and rollback must keep the protected game routes and OAuth/session implementation consistent.
