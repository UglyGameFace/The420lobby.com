# MultiBump Public

An independent Discord service at `https://bump.the420lobby.com`. Its Worker and D1 database are separate from the Lobby website, arcade, Shield manager and Android client. Production code never imports the Android account-automation transport; only its directory catalog is shared.

## Server-owner flow

1. Sign in with Discord and select a server you manage.
2. Add MultiBump using the server's install link. Directory bots are installed separately.
3. Choose a text/announcement channel and optional mentionable notification role.
4. Enable your directories and set the cooldown shown by their bots. Discodus and D-INVITES require an explicit interval because their defaults are unverified.
5. Members run the directory's `/bump` or vote themselves. MultiBump sends reminders, recognizes supported public confirmations, and stores administrator reports separately.

Discord also supports `/multibump setup`, `service`, `status`, `done`, `pause`, and `dashboard`. Commands require Manage Server permission and a guild installation.

## Development and checks

Node 24 is required for SQLite regression tests.

```sh
npm ci --prefix apps/multibump
npm test --prefix apps/multibump
npm run build --prefix apps/multibump
npm run migrate:local --prefix apps/multibump
apps/multibump/node_modules/.bin/playwright install chromium
npm run test:browser --prefix apps/multibump
```

Browser tests accept `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an already installed test browser. They serve local assets, mock API fixtures, exercise 320/390/768/1440px layouts, and never contact live Discord servers. Backend tests exercise the real SQL schema and handlers against isolated SQLite databases.

For local development, copy `.dev.vars.example` to an ignored `.dev.vars`, use a separate test Discord application and a local D1 database, and override `PUBLIC_ORIGIN` with the exact HTTPS development origin. Register its callback separately. Do not point local tests at production D1.

## Connect the production Discord application

Create a dedicated application in the Discord Developer Portal. Keep it separate from Dank Shield and the Lobby's existing OAuth application.

| Setting | Value |
| --- | --- |
| OAuth2 callback | `https://bump.the420lobby.com/auth/callback` |
| Interactions Endpoint URL | `https://bump.the420lobby.com/api/discord/interactions` |
| Installation context | Guild Install |
| Install scopes | `bot`, `applications.commands` |
| Bot permissions | View Channel, Send Messages, Embed Links, Read Message History (`84992`) |
| Public Bot | Enabled for installation in other servers |
| Message Content Intent | Enable for public bump-confirmation inspection; obtain Discord approval if required at the application's scale |

Set these **Worker secrets** on `multibump-public` (never on the private Pages project):

| Secret | Source |
| --- | --- |
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret |
| `DISCORD_BOT_TOKEN` | Bot token |
| `DISCORD_PUBLIC_KEY` | General Information public key |
| `ENCRYPTION_KEY` | Random 32-byte hex AES key, generated during provisioning |

Set the application ID/public key before saving the interaction endpoint, so Discord's signed PING can succeed. Register commands with `npm run register --prefix apps/multibump`, providing the app ID and bot token through the process environment. Registration upserts only the named `/multibump` command and preserves other commands. Secrets are never echoed. Distribute the `/install` link only after configuration is complete.

The homepage remains usable with an explicit launch-pending message while credentials are absent. `/health` reports `setup_pending`; no fake invite URL or successful Discord installation is claimed.

## Deployment

`wrangler.jsonc` names the dedicated Worker, custom domain, D1 UUID, minute cron and migration directory. The UUID is a resource identifier, not a credential.

```sh
npm run migrate:remote --prefix apps/multibump
npm run deploy --prefix apps/multibump
```

Inspect the intended Cloudflare account before running remote commands. Connector provisioning must also record `0001_public.sql` in the standard `d1_migrations` ledger so later Wrangler deployments do not reapply it. Deployments preserve existing Worker secrets. Do not rotate the encryption key without re-encrypting active integration secrets; rotating it invalidates encrypted OAuth sessions and webhook integrations.

## Guarantees and limits

- Every dashboard read/write checks the signed-in user's **current** Discord server permissions. A previously authorized administrator cannot retain access after losing Manage Server/Administrator. HTTP-only host-bound sessions expire within an hour. Only OAuth access tokens issued for `identify guilds` are held, encrypted with context-bound AES-GCM. No Discord user-account credentials are accepted.
- Server-owned SQL records, links, secrets, event history and receipt keys are scoped by guild ID. CSRF/origin checks protect mutations. Channel permissions and guild ownership are verified before saving settings. Notification mentions are limited to the configured role; no everyone/here mentions.
- Ed25519 authentication, timestamp checks, interaction replay claims and deferred responses protect Discord commands. The first response is sent before channel/network work. Component/user-install/DM command flows are not enabled.
- The scheduler checks at most five servers and attempts at most five reminders per tick, rotating fairly. A busy or backlogged deployment can take longer than a minute to check every server. Scale and monitor the deployment against Cloudflare's plan/query limits before advertising large public capacity.
- Polling walks backward through bounded 100-message pages and persists catch-up boundaries. Recent messages are rechecked for edited responses. Only known provider bots with slash-command context and explicit success text count. Arbitrary adverts, webhook messages, failed commands, old pre-install history and opaque responses cannot establish a confirmation. Provider message changes can require parser updates.
- Discord Message Content access applies to REST reads too. Private/ephemeral responses cannot be observed. Missing content, permission errors, catch-up and absent scheduler heartbeats are surfaced in the dashboard. Polling is an observer, not a guarantee that every directory interaction is visible.
- Each reminder due window is atomically claimed before sending. Timeouts/HTTP failures are visible and do not cause blind duplicate retries. A new confirmed/reported bump advances to a new window. Reminders never run another bot's slash commands.
- Initial cooldowns are estimates. Administrator reports are not provider confirmations. A stale confirmation cannot shorten a more recent reported cooldown.
- Each server can save its own official-directory voting links. Opening a link never creates a receipt. TheDiscordList JSON webhooks use each server's separately encrypted endpoint secret; signed listing identity and event UUIDs prevent cross-server attribution and duplicate counts, including redelivery with a new delivery UUID. Per-member votes do not reset the server's bump schedule. Other providers are link-only until an authenticated integration is implemented.
- Raw channel messages and voter identities are not stored. Activity is retained for 30 days, receipts for 90 days. Administrators can export public configuration/recent history and disconnect/delete their server's records. Signing secrets and access tokens are excluded from exports.

## Live acceptance still required after app connection

Use two independently managed test servers to verify install, OAuth callback, permission removal, channel selection, reminders, a real public `/bump` confirmation, pause/resume and a real signed TDL vote receipt. Verify `/multibump` in Discord and inspect scheduler heartbeat/error status. Passing offline tests or displaying the landing page does not establish those live outcomes.
