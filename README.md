# The 420 Lobby

Website: https://the420lobby.com
Community: https://discord.gg/the420lobby
GitHub: https://github.com/UglyGameFace/The420lobby.com

## Main arcade (October 2026)

The public `/arcade.html` is built from the separate `UglyGameFace/Arcade` React game sources under `new-arcade/src`. It includes **Sesh Invaders**, **Bong Blitz: Terp Master**, and **Canna-Runner**, using the website's dark green, lime, mint, and Barlow Condensed visual design. The homepage, Dank Shield, Dank Cinema, Minecraft hub, Cheers and Sesh Signal stay in place.

The original arcade page is retained at `/arcade-classic.html` for compatibility/regression testing; it is not promoted as the primary arcade. Old leaderboard records are preserved in D1. Both editions share the same Discord OAuth session and scores storage, with separate rules-version namespaces for the overlapping Bong Blitz title.

**Discord and score integrity:** `/api/session`, classic `/api/profile`, and new `/api/arcade-v2/profile` remain authoritative for login and player identity. New game rounds use `/api/arcade-v2/runs`, results use `/api/arcade-v2/runs/:id/finish`, and rankings use `/api/arcade-v2/leaderboards`. Guests can play, but their scores are local only. Signed-in scores require a CSRF-protected server-issued round and server-side range/timing/stat plausibility checks. The new games use browser-side randomness, so these community results are **not** deterministic replay-verified. Never grant Discord roles, prizes, or privileged progression from them. The old classic replay-verified scoreboard excludes v2 scores using `rules_version`.

Trophy-shelf achievements from the imported games are local-device progress, not server-authoritative accomplishments. The original Gemini mock users, mock scores, pretend Discord linking and direct browser webhook form are intentionally not published.

## Build and tests

Node.js 24 or newer:

```sh
npm install
npm run typecheck
npm test
npm run build
```

The static build script prepares a curated Pages `dist/` boundary, then Vite compiles `arcade.html` and the imported React/Tailwind arcade into hashed `arcade-assets/` files without clearing the rest of the site. Pages Functions still handle same-origin authentication, scores and Cheers. Cloudflare D1 schema is reused; no new database or credentials are necessary. CI also runs the original classic browser tests plus the new React arcade smoke/identity tests.

## Architecture and hosting

Inspection of source commit `6f45da382070a89a39fb18223a9598cd0d76a8c7`, the original README, and its validation workflow found a static, buildless Cloudflare Pages site named `the420lobby-com`, Git-linked to `main`, with the repository root as output. No existing authentication, database, or framework was present. Live HTTP inspection was unavailable because the workspace network proxy failed; hosting details come from the repository's documented configuration.

The upgrade retains Cloudflare Pages. Pages Functions provide same-origin Discord OAuth2 and secure session/run endpoints; Cloudflare D1 persists profiles, scores, achievements and temporary session data. `wrangler.jsonc` intentionally leaves Discord sign-in unconfigured and does not declare a D1 binding until a real database ID exists. A placeholder database ID must never be deployed. No external infrastructure has been created or changed.

The proposed build command is `node scripts/build-static.mjs`, with `dist` as output. Its explicit public-asset list prevents server source and local configuration from being published. This replaces the old no-build/root-output setting for the approved upgrade; no live hosting setting has been changed.

Discord client secrets and OAuth token exchange remain entirely server-side. Browser sessions use opaque HttpOnly/Secure cookies; writes require Origin and CSRF checks. The server replays seeded input transcripts and computes scores itself, with ownership, duration, action, payload, rate, expiry and duplicate-submission checks. Valid automated play remains possible; replay validation is not a guarantee that a player is human.

See [the backend and setup guide](docs/ARCADE_BACKEND.md) for the schema and API, and the [Discord website connection checklist](docs/DISCORD_WEBSITE_CONNECT.md) for the current Cloudflare Pages/D1/Discord activation steps. Discord client ID and secret are intentionally absent from repository configuration; add them as encrypted Pages bindings.

## Development and validation

Use Node.js 24 or newer. The new public arcade adds pinned React, Tailwind, Vite and TypeScript build dependencies.

```sh
npm install
npm run typecheck
npm test
npm run build
```

The test suite covers existing branding/community regressions, secure API requests, deterministic scoring and abuse rejection, actual SQLite migrations/queries/persistence, OAuth/session/CSRF behavior, and the public-asset boundary. The SQLite tests use Node's built-in SQLite module and mocked Discord responses.

For browser QA, install Playwright and its browsers in development/CI, then run:

```sh
node tests/arcade-browser.mjs
node tests/browser-smoke.mjs
node tests/cross-browser.mjs
```

Arcade browser tests use explicit API fixtures to verify UI behavior; fixtures do not create real Discord sessions or hosted data. Existing external homepage photographs still depend on their original Wikimedia URLs. Real Discord and the Cloudflare runtime need a final integration check after private development credentials are configured.

A plain static server can preview the layout but cannot authenticate players or save scores. Unconfigured or unavailable APIs keep games locked and show truthful status text. For secure local integration, follow the Wrangler/D1 instructions in the backend guide.

## Approval before release

**Do not deploy, change production bindings, apply remote migrations, push to an auto-deploying branch, or merge without the user's approval.** Cloudflare can automatically deploy Git branches/previews, so even a draft PR may trigger a deployment. This implementation is prepared locally for review.

Before an approved release: configure a Discord application with its exact callback URL, store its client secret as an encrypted Pages runtime secret, create/bind D1, apply the reviewed migration, and update the Pages build/output settings. Keep previews isolated from the production database and Discord callback. Preserve DNS and existing domain/email configuration.
