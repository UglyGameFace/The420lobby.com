# The 420 Lobby interactive experiences: active task checkpoint

**Active task:** integrate the twelve proposed lounge experiences into the existing website with one active implementation track. The existing realistic WebP smoke assets, Arcade, OAuth, D1 scoreboard, current four experience cards and all mobile layouts remain authoritative.

## Implemented in the first feature branch

- Tappable lounge room links existing Arcade, movie-night section, Discord member profile, and community invite area.
- Smoky Lounge, Midnight, and After Dark color atmospheres persist locally and work with private-mode storage failures.
- Optional hidden lounge emblem interaction changes the atmosphere.
- Shared 42-second Cheers is stored in the existing Cloudflare D1 and counts only unique signed-in participants. It is a separate website social countdown, not a Dank Shield /toke RSVP or voice session. Anonymous reads show aggregate round counts, never public Discord identities.
- POST /api/cheers requires Discord session, exact Origin, CSRF, strict JSON with no fields and an 18-actions/hour limit. GET /api/cheers returns the real active round or null. API failures show an honest offline state.

## Activation and checks

- Shared Cheers reuses the existing production D1 binding (`DB`). If the additive **migrations/0002_cheers.sql** tables are missing, the first authenticated, Origin/CSRF-verified Cheers join initializes only those missing tables and indexes with idempotent `CREATE IF NOT EXISTS` operations. Anonymous reads never modify the schema. Existing 0001 Arcade tables must already exist and Cloudflare Pages production D1 and Discord OAuth secrets must be configured. Applying 0002 with Wrangler before rollout remains a supported alternative. Never provision a second DB or add bot tokens/OAuth secrets to the browser.
- Pages previews intentionally have no production D1. A preview can show the lounge but shared Cheers may show offline until a separate preview D1 is configured.
- Build via `node scripts/build-static.mjs` and run `node --test tests/*.test.mjs`. Existing GitHub CI also checks Chromium, Firefox and WebKit on small and large screens.
- Sign in from Arcade, return to the lounge, press Cheers in two different accounts and check that the shared countdown/unique count agree. Repeated taps must not count twice; logout/invalid CSRF must fail.
- Reduced-motion and data-saving preferences must continue to stop the existing smoke animations. Inspect the original 420 wordmark and Cheers header after integration.

## Continuing the same active task

The following work is **still outstanding**, not advertised as shipped:

1. Higher-fidelity interactive room with optimized real licensed media and touch + keyboard navigation.
2. Arcade expansion beyond the existing three scored games.
3. Puff Streak: consent, secure opt-in photos, age/privacy controls, moderation and retention rules.
4. Movie-night calendar, RSVP and member voting backed by real configured event records.
5. Opt-in gaming activity and squad discovery backed by approved Discord data.
6. Moderated meme and sticker maker with safe media processing.
7. Licensed, user-initiated jukebox, track selection and sound visualizer, without autoplay.
8. Real community milestones and activity insights from supported authorized sources.
9. Additional theme visual effects, calibrated mobile performance modes and Easter eggs.

Do not fabricate live sessions, membership counts, event schedules, Discord statuses or audio licensing. Next implementation continues only after this branch passes its tests, is reviewed, and is deployed/migrated safely.

## Three-game improvement checkpoint (2026-10-18)

On the same sequential website task, Green Room Match now uses **six distinct photographic sources**. The blue glass hand pipe (CC BY 3.0, Smoke Cartel) is different from the green glass bong; source and attribution are in `shared/arcade-media.mjs` and `credits.html`. Green Room and Bong Blitz have a progress bar, higher-fidelity controls, accessible accuracy feedback and opt-in sound, all without changing deterministic authenticated replay. Sesh Signal gains readable safe-item, broken-glass and Chill Mode feedback. Motion reduction, no auto-playing sounds, and a visual fallback remain required.

**Important:** This is an improvement checkpoint across all three *current* games. Full feature/gameplay redesign remains open for sequentially versioned game rules, sound/scoring and real-device visual acceptance. Do not claim the entire Arcade task is complete based only on visuals.

### Avoiding interference with Dank Shield /toke

Dank Shield's `/toke` feature already has its own per-guild Cheers RSVP, Joining RSVP, voice membership, role notification and host session lifecycle. This website's Cheers round has a different purpose: a short global 42-second countdown. They do not sync, share records or trigger each other. No bot token, webhook, per-guild ping or role membership is added. In the future, any link must be opt-in and authorized, with one source of truth for Discord /toke sessions, no duplicate RSVP counting and no automatic role spam.

### Production acceptance

The website's GET /api/cheers should succeed against the configured D1 binding, returning `round:null` for an empty lounge. With missing Cheer tables, it also returns `setupPending:true` without writing schema. A signed-in member can explicitly start a round using the existing session/CSRF, which adds only missing tables and then joins. Verify two **real** signed-in users count as two unique participants, 42-second expiry and reuse, duplicate taps counting once, and that signing out does not break public reads. Check the actual production host, browser cookie, D1 binding and OAuth redirect; CI alone does not demonstrate live Cloudflare readiness.
