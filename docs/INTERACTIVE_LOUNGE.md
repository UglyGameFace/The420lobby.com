# The 420 Lobby interactive experiences: active task checkpoint

**Active task:** integrate the twelve proposed lounge experiences into the existing website with one active implementation track. The existing realistic WebP smoke assets, Arcade, OAuth, D1 scoreboard, current four experience cards and all mobile layouts remain authoritative.

## Implemented in the first feature branch

- Tappable lounge room links existing Arcade, movie-night section, Discord member profile, and community invite area.
- Smoky Lounge, Midnight, and After Dark color atmospheres persist locally and work with private-mode storage failures.
- Optional hidden lounge emblem interaction changes the atmosphere.
- Shared 42-second Cheers is stored in the existing Cloudflare D1 and counts only unique signed-in participants. Anonymous reads show aggregate round counts, never public Discord identities.
- POST /api/cheers requires Discord session, exact Origin, CSRF, strict JSON with no fields and an 18-actions/hour limit. GET /api/cheers returns the real active round or null. API failures show an honest offline state.

## Activation and checks

- The new SQL migration is **migrations/0002_cheers.sql**. Apply it in the existing production D1 after reviewing backups and before enabling shared Cheers on production. Do not provision a second DB. Never add bot tokens or OAuth secrets to the browser.
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
