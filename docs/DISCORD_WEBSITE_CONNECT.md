# Connect Discord sign-in to the420lobby.com

This is the **website's Discord OAuth sign-in**, not a Discord server migration or a Dank Shield bot deployment. The website, arcade and build are already committed to `main`. OAuth stays disabled until the Cloudflare database and Discord app are connected. Do not publish credentials to GitHub or send them in a chat.

## What is already implemented

- `/auth/discord` and `/auth/callback` use Discord's authorization-code flow with only the `identify` scope.
- `/api/session` reports sign-in state. The homepage and `/arcade.html` reuse the resulting secure browser session.
- D1 holds website player profiles, achievements, scores and short-lived hashed session/OAuth records. No Discord access tokens are stored there.
- `node scripts/build-static.mjs` creates `dist`, the required Cloudflare Pages output.
- **No bot token or Discord guild membership permission is required** for sign-in. Login does not automatically add members to your server or copy Dank Shield data.

## 1. Create D1 in Cloudflare

Open [Cloudflare dashboard](https://dash.cloudflare.com/) → **Storage & databases → D1 SQL Database** (wording may vary) → **Create database**.

Suggested production name: `the420lobby-arcade`. The database ID is a UUID displayed by Cloudflare; it is **not** a password. Create a separate database for any preview that will process actual test logins.

**Important:** Cloudflare treats the committed `wrangler.jsonc` as the source of truth for Pages Functions. A D1 binding in the dashboard may not survive the next Git-linked deployment if it is absent from the file. Once the real database exists, add this configuration to **`wrangler.jsonc`** and redeploy:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "the420lobby-arcade",
    "database_id": "YOUR_REAL_D1_UUID",
    "migrations_dir": "migrations"
  }
]
```

This is a **sample**, not a valid value to paste unchanged; replace the UUID first and preserve the other existing configuration properties. Never add a fake or all-zero UUID. Do not point preview/test traffic at production D1.

## 2. Apply the database schema

Before enabling logins, review and run the repository's [`migrations/0001_arcade.sql`](../migrations/0001_arcade.sql) against the correct D1 database.

On Android, open the database in Cloudflare and use its **Console** SQL editor. Use the SQL file's actual contents, not a sample schema. If you have Wrangler in an authorized terminal, the equivalent migration workflow is:

```sh
npx wrangler@4 d1 migrations apply the420lobby-arcade --remote
```

Only run this against the intended database; review pending changes before confirming. This first migration creates `users`, `oauth_states`, `sessions`, `game_runs`, `scores`, `achievements`, and `rate_limits`. It should not be rerun blindly against an already initialized database.

A safe read-only verification query in the Cloudflare D1 Console is:

```sql
SELECT name FROM sqlite_master
WHERE type = 'table' AND name IN
('users','oauth_states','sessions','game_runs','scores','achievements','rate_limits')
ORDER BY name;
```

All seven names should appear before users authenticate.

## 3. Configure a Discord OAuth application

Open [Discord Developer Portal → Applications](https://discord.com/developers/applications). Create a website-specific application, or explicitly select an existing application you own.

Under the application's OAuth2 redirect configuration, register **exactly**:

```text
https://the420lobby.com/auth/callback
```

The implementation requires the OAuth2 **authorization code** flow and the `identify` scope. Do **not** enable `bot`, `guilds.join`, email or privileged member scopes just for website sign-in. Take the application's **Client ID** and **Client Secret** from its OAuth2 settings. Never copy the bot token into either field.

## 4. Add encrypted Cloudflare Pages secrets

Open **Workers & Pages → the420lobby-com → Settings → Variables and Secrets**. In the **Production** environment, add the following values as encrypted/secrets (not publicly visible plain-text `vars` in Git):

| Name | Value |
| --- | --- |
| `DISCORD_CLIENT_ID` | Actual Discord application Client ID (17–20 digits) |
| `DISCORD_CLIENT_SECRET` | Matching OAuth2 Client Secret |

`SITE_ORIGIN=https://the420lobby.com` is already set as a nonsensitive value in `wrangler.jsonc`. Do not create an additional conflicting origin variable. Redeploy production **only after the D1 binding/schema and OAuth redirect are ready**.

The old empty `DISCORD_CLIENT_ID` entry was removed from `wrangler.jsonc` so it cannot overwrite the real value during deployment. The Client ID is public by nature but storing it as an encrypted Pages binding keeps application configuration in one place.

## 5. Verify on a real phone

1. Open **https://the420lobby.com/api/session** in your browser. Before signing in it should respond with JSON containing `"user":null`. When correctly configured, `"configured":true`.
2. Visit **https://the420lobby.com/arcade.html**, tap **Sign in with Discord**, authorize your chosen application, and confirm you're returned to the exact canonical domain.
3. Confirm your Discord name/avatar appears in the arcade and the homepage's Sesh Signal section. Refresh. Play each game and verify a score/achievement persists.
4. Log out and confirm your old authenticated session can no longer create a round or load protected scripts.

**Security notes:** A `configured:true` value indicates the runtime bindings are present; it does **not** alone prove the D1 schema was applied or that the real OAuth redirect works. Test with a real browser before announcing launch. Browser cookies use the exact canonical site; avoid testing production login through random preview `pages.dev` origins. Keep separate identities/secrets and a separate D1 for authenticated previews.

## About Discord server membership

Discord `identify` proves a visitor's Discord account identity but **does not** prove that they joined The 420 Lobby server, hold a role, or are age verified. Guild membership/role gating, server announcements and Dank Shield statistics are separate future integrations that require explicit design and permissions. This initial connection only links a Discord identity to the website account/arcade.

Official references: [Cloudflare Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/), [Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Discord OAuth2](https://discord.com/developers/docs/topics/oauth2).
