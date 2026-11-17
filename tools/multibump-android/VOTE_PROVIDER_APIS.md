# Free server voting: official API and bot integration matrix

Research checkpoint: 2026-11-17. Scope: The 420 Lobby's existing six
MultiBump directory bots, plus TheDiscordList's official TDL vote bot.

**Terminology matters:**
- *Submit a server vote*: a user action that creates a valid, provider-counted server vote.
- *Verify a vote*: receive a server vote event reported by the provider.
- *Vote for the provider's bot*: helps that bot on a separate listing, **not** our server.
- *Bump*: directory promotion on a separate cooldown, not necessarily a server vote.

No authorized, documented API for **unattended server-vote submission**
was found for the seven providers below. Do not substitute an OAuth page
request, user-account session replay, private web endpoint, browser automation,
or an unrelated vote-count API.

| Provider | Verified submission interface | Official reporting/API | Allowed integration |
| --- | --- | --- | --- |
| TheDiscordList / TDL | **Official bot** `/upvote`, member-initiated in their server. 12h per person per guild | `listing.upvoted` webhook to a Discord webhook target, or signed JSON webhook with `X-TDL-Signature` and `X-TDL-Delivery` | **Implemented vote-only configuration and passive Discord webhook receipts.** Not in the auto-bump queue |
| Discordify | Website server listing with Discord OAuth, free server votes | `POST https://discordify.net/api/bot/vote-status` is for **BOT listings**, not a server-vote cast API | Manual browser voting/history optional; auto-cast unsupported |
| Discadia | Free server voting by person; no authorized server-vote submission API found | No documented account-scoped server-vote receipt API established | Manual, no auto-cast |
| D-INVITES / DiscordInvites | Real user voting on the directory; **scripted voting prohibited** | Official New Vote notification delivered to an owner's configured Discord webhook | Passive provider notifications implemented after setup; no auto-cast |
| OneBump | `/vote` directs to **vote for OneBump on Top.gg** for Premium credits, not a server vote | No server-vote submission API established | Remains a bump service; no server vote |
| DISBOARD | `/bump` only | No independent server-vote API established | Existing bump service |
| Discodus | No independently verified server-vote interface | No verified server-vote receipt API | Existing bump service, vote capability unverified |

## TheDiscordList concrete verified values

- **Official bot application ID:** `1522501063456985179`.
- **Official install:** `https://thediscordlist.com/tdl` (Add to Server).
- **Server listing creation/claim:** `https://thediscordlist.com/listings/create`.
- **Member command:** `/upvote`. Every 12 hours for each person and server.
  The bot itself enforces the clock and confirms whether each vote counted.
- **Listing webhook:** Manage → Webhooks → New endpoint. Target a Discord
  webhook in your chosen staff channel. Subscribe **only** `listing.upvoted`
  for a dedicated webhook, and register its numeric Discord webhook ID with
  MultiBump v15.4. The provider posts formatted messages to Discord.
- **JSON webhook alternative** (requires a separately deployed public backend):
  `X-TDL-Signature: t={unix},v1={hex}` is an HMAC-SHA256 over
  `{timestamp}.{raw body}`, using the listing-specific secret. Reject
  deliveries older than five minutes, compare in constant time, and dedupe
  by `X-TDL-Delivery`. **Not** a vote-cast interface.
- **Bot listing APIs** (not vote-cast APIs): `POST /api/bots/{bot}/stats`,
  `POST /api/bots/{bot}/commands`, and
  `POST /api/bots/{bot}/heartbeat`. They update a developer's bot listing.
- TheDiscordList's published terms explicitly prohibit automated ranking
  manipulation, including scripts and automated bumping. This integration
  neither submits TDL votes nor masquerades as a member.
- Important: adding the integration to `config.json` **does not install the
  official bot or claim the listing**. An administrator must authorize the
  Discord installation and create/claim the server listing.

## Secrets, trust and production limits

The Android companion saves only the **numeric** Discord webhook ID, exact
configured channel/guild, and vote-notification phrase, never the webhook URL
or token. Incoming messages must match that source, valid creation age,
and vote-specific phrase; duplicate message IDs are ignored. These are
*trusted Discord webhook observations*, not HMAC-verified provider responses.
The provider's actual formatted Discord message must be checked once on
device to confirm the text matches. A provider-owned sender can change formats.

This observer does **not** treat the latest community vote as the current
user's vote or advance the current user's 12h/24h clock. It does not request
third-party credentials or consume an unknown API. Everything remains
separate from the existing six bump schedules, commands, and persisted state.

## Official documentation

- [TDL /upvote guide](https://thediscordlist.com/guides/upvote-your-server-from-discord)
- [TDL official bot](https://thediscordlist.com/tdl)
- [TDL webhook events/signing](https://thediscordlist.com/guides/webhooks-for-your-listing)
- [TDL bot listing API](https://thediscordlist.com/guides/discord-bot-directory-is-live)
- [TDL Terms](https://thediscordlist.com/terms)
- [Discordify bot vote-status documentation](https://discordify.net/blog/how-to-promote-your-discord-bot/)
- [DiscordInvites vote/webhook events](https://discordinvites.net/it/blog/notifications-webhooks)
- [DiscordInvites terms](https://discordinvites.net/tos)
- [OneBump command guide](https://bump.ltd/guides/commands)
- [Discord policy on automated user accounts](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)

**Upgrade path:** This document belongs to draft PR #67 on
`feat/multibump-free-vote-tracker-20261117`; the code has **not** been
merged/deployed to production. On Android, the owner must first upgrade the
Termux installation from that branch and then choose menu **8 → 1** to enable
the TDL vote-only profile for their configured server, and **8 → 2** if they
want passive provider webhook vote notifications.
