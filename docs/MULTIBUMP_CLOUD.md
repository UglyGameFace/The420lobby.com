# MultiBump Cloud Manager

**Status:** Implementation proposed on a feature branch. This document does not claim production deployment or verified live reminders.

## What this adds

- A mobile-first private page at https://the420lobby.com/bump-manager.html (Pages static assets).
- Same existing Discord OAuth/session and CSRF validation as the Arcade and Cheers APIs.
- Owner-only service setup, add/edit/archive, pause/resume, manual completion, cooldowns and audit history.
- An independent 5-minute scheduled Worker that checks D1 and sends **manual reminders**, if an authorized Discord webhook secret is configured.
- One reminder attempt per service and due window, even with overlapping cron invocations. Ambiguous delivery is marked unknown rather than retried/spammed.
- Real scheduler heartbeat for the dashboard. Stale/not-deployed status remains visible; an API response alone is not proof the scheduler is running.
- Installable Android home-screen shortcut via a web manifest. No phone or Termux uptime is required for server-side reminders.

## Scope, service compliance and accuracy

This feature **does not perform automated bump commands**, run a self-bot, use a Discord user token, simulate human activity, or bypass service limits. The only outbound Discord API call is a reminder through a webhook you control. Provider policies are not assumed to permit auto-bumps. Future official adapters require per-provider permission and explicit implementation/review.

Do not run the old phone automation and an authorized alternative for the same service at the same time. The manager cannot import or infer private cooldown state from the previous Termux script; adding a service schedules its first **estimated** reminder after one configured cooldown. Mark a manually completed bump to anchor the timer accurately. “Owner marked complete” is never a verified provider success.

No automatic second reminder for unknown, timed-out or rejected deliveries. The owner can inspect history and mark actions explicitly. Pausing does not discard audit history; archiving excludes a service from future reminders.

## Infrastructure choices

Existing production site (unchanged until approved merge):

- Cloudflare Pages project: `the420lobby-com` from `UglyGameFace/The420lobby.com` main.
- Existing same-origin OAuth and HttpOnly session cookie; **no new OAuth redirect URI**.
- Existing D1 database: `the420lobby-arcade`, binding `DB`; additive tables only.
- New separate Cloudflare scheduled Worker: `the420lobby-bump-scheduler` with cron `*/5 * * * *`, the same D1 and a server-side webhook secret.
- No public Worker URL/route, and no bot credentials in browser assets, GitHub code or D1.

Cloudflare Workers Cron Triggers execute periodic jobs, not a permanently running process. At-least-once invocations and network timeouts are handled through atomic due-window claims.

## Activation after review/approval

1. Validate the PR with `npm install`, `npm run typecheck`, `npm test`, and `npm run build`. Validate the separate Worker with `npx wrangler deploy --dry-run --config wrangler.bump.jsonc` (does not deploy).
2. Ensure Pages has production `DB`, `SITE_ORIGIN`, `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, as already configured for the website. Set production variable **`BUMP_MANAGER_OWNER_ID`** to the actual Discord user ID of the owner (17-20 digits). Do not guess this ID, and do not use the server ID.
3. After approved production release, open `https://the420lobby.com/bump-manager.html`, sign in with Discord, and press **Initialize manager**. This action creates only the tables in `migrations/0004_bump_manager.sql`; it is idempotent. Alternatively apply the migration explicitly with the normal D1 migration process, after reviewing it and backing up as needed.
4. Add each service's exact Discord channel link, correct minimum cooldown and name. Pause any service whose terms are uncertain. No bump is sent by adding a service.
5. Configure the separate Worker secret `BUMP_REMINDER_WEBHOOK_URL` using the Cloudflare dashboard or `npx wrangler secret put BUMP_REMINDER_WEBHOOK_URL --config wrangler.bump.jsonc`. Use a webhook **you own**, for a private Discord reminders channel. Webhooks only send reminders. Do not paste webhook URLs into GitHub, chat, or public logs.
6. Deploy the separate Worker with `npx wrangler deploy --config wrangler.bump.jsonc` only after authorization. Confirm the configured 5-minute Cron Trigger. Cloudflare may take up to ~15 minutes to propagate cron changes.
7. Verify the dashboard's real **Scheduler online** heartbeat after at least one invocation, and verify that a due reminder appears **once**, never as a bump command. Test an expired due interval, service pause, service edit, webhook failure, and restart.

If the Owner ID is missing, the manager API fails closed with setup required. Nonowners get HTTP 403, anonymous visitors HTTP 401. Previews must **not** bind production D1 or secrets.

## Operational semantics

| UI or database state | Grounded meaning |
| --- | --- |
| Scheduler not yet verified | No observed Worker heartbeat |
| Scheduler stale | Last recorded Worker run is more than 15 minutes old |
| Reminder setup pending | Worker ticks occurred, webhook secret missing or invalid |
| Reminder sent | Discord webhook returned a 2xx response |
| Reminder unknown / HTTP error | Delivery was ambiguous or rejected; no automatic repeat |
| Owner marked complete | Owner claims the bump was completed; no provider attestation |
| Next eligible reminder | Computed from owner report or initial conservative estimate |
| Paused / Archived | Excluded from scheduled delivery, history retained |

## Rollback

Stop the separate Worker or disable its Cron Trigger first. The old website and Arcade do not depend on the new tables. Reverting the Pages code removes the dashboard and API without deleting D1 history. Do not drop D1 tables on rollback unless records are backed up and the owner specifically authorizes removal.

## Evidence and remaining production validation

CI tests can prove the local API access rules, SQL semantics, and mock webhook behavior. They cannot prove Discord OAuth or webhook delivery from a live Cloudflare deployment. The production Worker and webhook secret remain separate installation steps. Do not label the feature live until a real heartbeat and an end-to-end reminder are observed.
