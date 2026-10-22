# The 420 Lobby homepage audit — October 22, 2026

Scope: `https://the420lobby.com/` (primary static homepage) and its Cloudflare Pages Functions/D1 production bindings. The arcade subdomain remains a separate destination. Changes in this audit intentionally avoid database mutations, Discord redirect/credential changes, and game rules.

## Confirmed findings and fixes

| Priority | Finding | Evidence | Resolution |
| --- | --- | --- | --- |
| High | **Invisible text on JOIN THE SERVER in the mobile menu.** | `styles.css` gives `.desktop-nav .nav-join` a luminous lime background with dark ink, but later-loaded `lobby-redesign.css` changes just its text to lime. The supplied in-app browser screenshot shows lime on lime. | Correct the existing authoritative `lobby-redesign.css` declaration rather than adding another override layer; responsive browser checks >=4.5:1 computed contrast. |
| Medium | **Expanded nav visually merges with the hero underneath.** | The original dropdown overlays animated CHEERS artwork without a visual separation layer. | A lightweight, noninteractive dimmer in the existing redesign stylesheet separates the open mobile/tablet menu from the hero; the menu remains scrollable on short screens. No extra event listener or animation was added. |
| Medium | **Unqualified new arcade score verification claim.** | The homepage promises "real verified high scores" for the new three-game arcade. New React v2 saves Discord-linked scores with plausibility and time validation; these scores are **not** deterministic replay verified. | Use "Discord-linked community scores" in the homepage room description and preview. Legacy Sesh Signal and Spark Relay server-verified claims are untouched. |
| Medium | **Unexpected API error logs lack endpoint context.** | `errorResponse` logs only "Arcade request failed" and exception class, making production failures hard to connect to an endpoint while protecting secrets. | Attach an allowlisted route name, safe method, sanitized Cloudflare Ray ID, and exception class. Never record raw paths, query strings, OAuth code, cookies, SQL text, user IDs, or exception messages. |
| CI | **A recent `main` validation run failed at Firefox tablet navigation while its earlier PR version passed.** | Workflow `39840232718` failed on an immediate menu-visible assertion; PR `39832947703` passed equivalent cross-browser tests. | Wait for the browser-visible menu and validate accessible expanded state; preserve real interaction checks instead of hiding the failure. This is a timing-resilience change, not proof the underlying browser issue is fixed. |

## Backend audit, read-only

- Cloudflare Pages project `the420lobby-com` production branch is `main`, build command `npm run build`, output `dist`. Production has the **DB** D1 binding and names `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `SITE_ORIGIN` in its runtime environment. No values are revealed here.
- Production D1 contains `users`, `sessions`, `oauth_states`, `scores`, `game_runs`, `rate_limits`, `achievements`, `cheers_rounds`, `cheers_sparks`, `cheers_participants`, and `cheers_presence`.
- At the checkpoint: 1 user, 4 session records, 6 game-run records, 1 score record; **0 orphaned scores, 0 orphaned runs, 0 expired sessions**. All six runs were labeled `rules_version='1'`. Counts are momentary and should not be mistaken for total signup or recent activity.
- The homepage's HTML points its arcade links to `https://arcade.the420lobby.com/`. The custom domain is configured on the same Pages project. Root-site and arcade sessions use separate host-only cookies by design.
- `_headers` already provides `nosniff`, referrer, frame, permissions, and content-security policies on static assets. Pages Functions separately protect JSON errors by never returning stack traces/SQL/credentials to browsers. Application-side routes require their own guards.

## Follow-up validation and explicit limits

- Run all Node/SQLite backend tests, browser smoke tests at 320–1440px, cross-browser Chromium/Firefox/WebKit, security audit, Pages Functions compile, and check production deployment after merge.
- A passing simulated OAuth callback cannot prove that a real Discord user has completed an actual sign-in on every host, nor that every third-party image URL is available on all devices.
- Cloudflare Pages/D1 configuration audit cannot on its own establish real user experience at every device resolution or reveal external monitoring/logs not exposed by this integration.
- Public endpoints must remain privacy-safe and no synthetic production game runs/scores should be inserted to fake leaderboards.

**No data, DNS, authentication secrets, domains, or database schema are changed by this PR.**
