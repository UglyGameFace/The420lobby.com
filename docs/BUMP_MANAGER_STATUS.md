# MultiBump project status

Updated 2026-11-22. Current direction: preserve the original human-account
auto-bumper. The inviteable-bot conversion has been withdrawn; see
[MULTIBUMP_PUBLIC_STATUS.md](MULTIBUMP_PUBLIC_STATUS.md) for the correction,
resource shutdown evidence and remaining distribution work. Earlier entries
below retain their historical scope and validation dates.

## Objective
Provide versioned source and offline regression coverage for the standalone Android v14 cooldown observer, while maintaining the separate owner-gated cloud manual-reminder manager.

## Evidence and implementation
- Repository: `UglyGameFace/The420lobby.com`; existing PR #64 branch `feat/bump-manager-cloud-scheduler-20261114`.
- Cloud manager: unchanged owner-only dashboard + D1 state + manual reminders through a webhook, never automated `/bump`.
- Android v14: 34 source, documentation and test files under `tools/multibump-android/`. Includes public-message confirmation observer, persisted shared SQLite cooldown floor, bounded restart history scan, and nonconfirmation safeguards.
- Website build: curated `scripts/build-static.mjs` list does not publish any file under `tools/`.
- No login token, `.env`, personal configuration, or SQLite data committed. The standalone client still uses an unsupported Discord user account automation library.

## Validation
- Pre-GitHub v14 archive: `python -m unittest discover -s tests -q` passed 99 offline tests on Python 3.13.
- Existing cloud manager PR head `993994a260ace3ebcba287ea60fc79f8912bc966` passed GitHub Actions run `43655416435`.
- CI now runs the v14 Python suite on subsequent PR heads; **do not assume CI passed on the new head until its run finishes**.
- No production Android, Discord, Cloudflare Worker, private D1, or external webhook verification established for these changes.

## Known limitations and deployment
- Public confirmations may be missed due to private/ephemeral responses, permission gaps, inaccessible history, changed bot templates, service-specific cooldown semantics, or races.
- Android SQLite scheduling and Cloudflare D1 reminder scheduling are **independent**; they do not share a state machine or provide universal duplicate prevention.
- Discord forbids self-bot automation on user accounts; this source archive does not change policy compliance.
- PR #64 remains a draft until release readiness is established. Production Pages owner ID and reminder webhook secret are missing/unverified. Do not apply remote migrations, deploy the Worker, or merge into a deploy-triggering main branch as a substitute for missing production prerequisites.

## Next
- Confirm CI on the exact new PR head, then reconcile review and any deployment blockers.
- Activate the cloud reminder manager only with production setup and real end-to-end verification.
- Verify v14's shared-cooldown observer against real public confirmations on the device; retain conservative status for opaque provider outcomes.

## 2026-11-15: Shield private staff host
- Direction: public Lobby homepage remains untouched; Shield is an **owner-only** administrative subdomain, named `shield.the420lobby.com`.
- Implementation under PR #64 includes protected Shield landing page and MultiBump UI, exact-host staff asset gating, Discord OAuth browser-bound cross-host handoff, owner-ID authorization, and an explicit denial on the main public hostname.
- Dank Shield integration will use existing bot operations and separate permission-checked APIs. No production bot connection or moderation commands are claimed for this initial shell.
- **Not deployed:** do not attach `shield.the420lobby.com` to the Pages project until the tested PR reaches main, otherwise the public homepage could be served under the staff hostname.
- Staff roles beyond the configured owner are not yet implemented; there is no guessed role permission or exposed member list. The existing cloud reminder-only policy and separate Android client remain unchanged.

## Shield integration hardening
- Shield is recognized by its exact hostname even if SITE_ORIGIN is broken; staff host never falls through to public member homepage.
- Optional SHIELD_STAFF_IDS comma-separated allowlist grants **read-only** dashboard and source CI access. BUMP_MANAGER_OWNER_ID still must be configured, and only its holder can change schedules or settings.
- GET /api/shield/status reports latest Dank Shield main-branch GitHub workflow evidence only (best-effort, cached). It NEVER treats passing CI as live bot uptime or opens the protected localhost admin API.
- Public website remains untouched, and private assets are routed through the owner/staff session guard. This status is not yet deployed or live-verified.

## 2026-11-15 Shield owner activation deployment

- Configured the production Pages `BUMP_MANAGER_OWNER_ID` with the owner's supplied Discord **user** ID (value intentionally not stored in this public repository).
- Cloudflare Pages `retry` of an old deployment replayed the deployment's earlier env vars and reverted that setting. A fresh **Git source deployment** is required instead. This documentation update deliberately triggers the Git-connected production rebuild without changing public website behavior.
- After deployment: confirm the exact production deployment has `BUMP_MANAGER_OWNER_ID`, plus the existing secret Discord OAuth bindings, before reporting the owner sign-in as available.
- Public Lobby site content remains unchanged. Reminders need an independently configured webhook; Dank Shield's private admin API remains disconnected.

### Production-binding correction

- The Pages site's checked-in `wrangler.jsonc` declares production plaintext `vars` and takes precedence over ad hoc dashboard plaintext bindings. A plaintext `BUMP_MANAGER_OWNER_ID` appeared briefly during builds but was removed from the final deployed settings.
- The owner-supplied ID is now stored as an **encrypted Pages production binding** (`secret_text`), following the existing Discord OAuth secret pattern, not committed to source. This documentation change triggers a fresh Git-connected production deployment to pick it up.
- Validate that the final successful production deployment retains the *key*, not just the in-progress deployment. No changes to public content, bot actions, permissions or stored secrets are required.

### Correct primary owner account, 2026-11-15
- Existing Shield owner ID was the Dank Tested alternative account, not the Discord guild owner. Cross-checked The 420 Lobby's `guild_configs.owner_id` (current source updated November 15). The primary owner's numeric ID is not committed to public repository source.
- Updated Cloudflare encrypted production `BUMP_MANAGER_OWNER_ID` to the main account and encrypted `SHIELD_STAFF_IDS` to allow Dank Tested read-only access. Never promote staff to owner simply because both accounts belong to one person.
- This documentation commit triggers a fresh Git-connected Pages deployment because updating settings alone does not change an already deployed Pages Functions environment.
- Dank Shield operational health and moderation APIs remain disconnected until a separately tested and authorized read-only integration is deployed.

## Authenticated Dank Shield aggregate bridge
- Actual Dank Shield database counters for The 420 Lobby are exposed exclusively through a **new read-only Supabase Edge Function** protected by an Ed25519 signature from the Cloudflare private server; the Edge Function's public key is checked into the Dank Shield repository. The signing private key is a Cloudflare **encrypted production secret** only.
- Shield's authenticated owner/staff `/api/shield/status` adds `dankShield.database` with ticket-status counts and recent 24-hour activity counts, labeling unavailable and unconfigured states explicitly.
- The source is Dank Shield's existing Supabase project. No individual ticket contents, member IDs, personal information, or administrative operations are proxied. Discloud runtime health and the localhost secured Bot API remain *unconnected*.
- The endpoint must not be treated as complete until the Supabase Edge Function is deployed, the server-side signing secret is set, and an authenticated response is verified. This is separate from MultiBump's local Termux scheduler.

### Integration verification and staff UI (2026-11-15)
- The Shield homepage and the MultiBump module now display the same authenticated, read-only Dank Shield snapshot. The standalone cloud scheduler does **not** mirror Termux's local services or automatically send commands. Its D1 service count is independent.
- Signed connector failures are categorized into safe codes (401, 403, 503, timeout, invalid response) and shown without leaking keys. The browser can refresh evidence, including when returning from Android background, and never equates stale heartbeat with a live bot.
- GitHub CI and private signed database retrieval are started concurrently to avoid unnecessary serial latency.
- A production deployment and green CI do not on their own prove an authenticated user opened the new status page or that the Supabase Edge Function responded. Confirm this separately from the actual user session and provider logs.


## 2026-11-22: Preserve the original automatic method

The owner explicitly requires the existing human-account slash-command
execution. The proposed inviteable-bot/reminder replacement was withdrawn
from PR #67. The Android transport and its existing per-server scheduling
remain authoritative. The separate private Shield reminder manager is
unchanged. Current correction and validation are in
[MULTIBUMP_PUBLIC_STATUS.md](MULTIBUMP_PUBLIC_STATUS.md).
