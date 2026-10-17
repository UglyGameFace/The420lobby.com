# Upgrade review

Prepared locally from `UglyGameFace/The420lobby.com` source commit `6f45da382070a89a39fb18223a9598cd0d76a8c7`. Original source blob hashes were checked when preparing the patch. No remote commits, pull requests, deployments, production migrations, DNS changes, or Discord application changes have been made.

## Included

- Original community homepage, smoke logo, illustrations, Dank Shield, Dank Cinema, Minecraft Java/Bedrock content, and verified Discord invite remain.
- New green/purple arcade at `/arcade.html`, with original accessory/cabinet artwork, locally bundled licensed heading font, filters, Discord profiles, ten achievements, and per-game weekly/all-time leaderboards.
- Sesh Signal retains its 42-second gear collection, kit bonuses, glass hazards, combos, Chill Mode, sound, touch/keyboard controls and pause/resume. Ranked rounds now require Discord and server validation.
- Green Room Match and Bong Blitz add memory and timing play with desktop/mobile controls.
- Cloudflare Pages Functions perform Discord OAuth and session handling server-side. D1 stores profiles, scores and achievements. CSRF, origin, ownership, request/rate bounds and deterministic replay protect submissions. Duplicate and competing finishes persist one result.
- Public assets are staged into `dist/` using an explicit allowlist. Backend source, migrations, tests and local configuration are excluded from that directory.

## Validation completed

57 individual Node tests pass: 22 branding/site regressions, 19 scoring/replay tests, 10 backend/SQLite/OAuth/session tests, five API client tests, and one production asset-boundary test. All JavaScript and browser test scripts pass syntax checks; `git diff --check` is clean. `node --test tests/*.test.mjs` passes all five test files. The static build completes successfully.

Backend tests execute the actual migration and SQL statements against Node SQLite; Discord responses are mocked. Real Discord credentials and a hosted D1 database were not available. Chromium exists in this workspace, but the sandbox prevents its required socket calls. Browser tests could not execute and no browser screenshots were generated. Browser test source includes responsive guest gating, explicit fixture identities, both new game flows, pause/resume, transcript submission, server-returned scores, achievements, and session expiry. CI is prepared to execute those tests in Chromium, Firefox and WebKit as applicable; its results are still pending.

## Before an approved release

Follow [ARCADE_BACKEND.md](ARCADE_BACKEND.md): configure a Discord application and exact callback URL, add its client secret as an encrypted Pages runtime binding, create/bind D1, apply the reviewed migration, and change the proposed build command/output to `node scripts/build-static.mjs` / `dist`. Complete real OAuth, persistent reload and Cloudflare runtime acceptance using isolated development infrastructure first. These steps have not been performed.

Use the supplied patch in the existing repository. Do not replace the repository with an extracted snapshot: applying the patch preserves original unmodified assets, including historical assets that are not used by the current pages. The local Git history is an inspection/import history, not a fetched clone suitable for pushing over the repository.

**Deployment approval remains required.** Git-linked branches and pull requests may trigger Cloudflare previews, so no branch was pushed. The configured backend fails closed while its private settings are absent. Replay validation rejects invalid actions; it cannot guarantee that legal input was produced by a human.
