# MultiBump v14 Android companion

**Source:** [`tools/multibump-android/`](../tools/multibump-android/)  
**Status:** offline-tested source, not a connected GitHub release or live Android verification.

## Purpose
The local Termux client observes publicly readable responses from known bump-directory bots. A verified server-wide success from another member adds a persisted SQLite shared cooldown floor, so restarting or reconnecting does not erase that hold. Source messages must match configured bot identity, guild, channel and response evidence. History scans are bounded and logged. Missing, ephemeral or ambiguous replies are not proof of success.

The existing client independently schedules `/bump` commands on a Discord **user account**. Discord prohibits self-bots. The independent website bump manager is a manual-reminder product, not a controller for this client, and does not synchronize its SQLite cooldowns.

## Termux update (preserves state)
Use the release ZIP already downloaded on Android, stop the current process with Ctrl+C, and run:

```sh
cd ~/storage/downloads
unzip -oq MultiBump-v14.zip
bash multibump-selfbot/easy-install.sh
```

Alternatively, after checking out this PR on a device with Git, run `bash tools/multibump-android/easy-install.sh`. The installer targets `~/multibump-selfbot`, reuses existing config and state, and does not copy private credentials back into this repository. Run `multibump` to reopen the menu.

## Tests
```sh
cd tools/multibump-android
python -m compileall -q .
python -m unittest discover -s tests -q
```

The GitHub workflow runs these offline checks without installing the self-bot dependency, logging into Discord, or executing bump commands.

## Security and limits
- Never commit `config.json`, `.env`, `*.sqlite3*`, user tokens, or Discord webhook secrets.
- No guarantees for inaccessible public history, bot-specific semantics, message deletion, or race conditions.
- Manual bump reminders and Android client scheduling do **not** share state; disable overlapping schedules for the same service.
- CI validates source and simulated events, not production Discord behavior or user-account policy compliance.

## v15 free directory voting (November 17, 2026)

A phone-first `Free directory votes` menu and standalone `multibump-votes`
Termux launcher now track manually confirmed free server-directory votes while
the v14 bump observer and SQLite schedule continue unchanged.

- Known free directory presets: Discordify and Discadia. The 420 Lobby
  Discordify listing URL is owner-supplied; Discadia and other directory links
  must be pasted from the actual server listing.
- Each directory has an independent account-level cooldown (24 hours by
  default). Multiple server listings on the same provider share this floor
  to avoid treating one Discord account as multiple voters.
- The verified website performs sign-in and voting; the client only opens its
  HTTPS listing and allows the user to self-report success. It cannot infer
  success from a click, OAuth authorization, or elapsed time.
- Local SQLite `vote_state` and `vote_events` are separate from `schedule`,
  `dispatch_clock`, and public bump events. Existing configs/state remain.
- Upgrade: use the main-branch Git checkout and `easy-install.sh` described
  in `tools/multibump-android/README.md` after the feature merges, not the
  earlier v14 ZIP.
- No automated vote submission, Discord credential reuse, undocumented voting
  API calls or login simulation are implemented. Discordify's published terms
  prohibit self-bots and abusive automation. Android and provider acceptance
  remain unverified until tested by the user on device.


## v15.2 vote-capability correction (November 17, 2026)

An owner test revealed the previous v15.x free-vote feature was a
Discordify-only manual browser link, not automatic voting. The current
feature branch corrects the default interface to show **all configured bump
providers** and their separate server-vote support, without invoking any
vote endpoint, browser or slash command.

- DISBOARD: no proven server-voting feature
- OneBump: /vote supports votes for the OneBump **bot** on Top.gg,
  not The 420 Lobby's server
- Discodus: free server voting not verified
- Discadia and Discordify: site-based member server votes, with no documented,
  permitted automatic server-vote submission API established
- D-INVITES / DiscordInvites: real member votes exist; provider terms prohibit
  bots, scripts and automatic vote generation. Official vote event notifications
  and custom Discord webhooks report votes; they do not submit them

The previous local self-reported voting history is retained only as an explicit
optional manual tool, never as proof of a vote. The six existing bump services,
their command schedules, saved credentials, and SQLite state remain unchanged.
Automated website submissions and success verification are **not implemented**
and cannot be claimed as complete without provider permission and a published
approved interface. The current feature PR remains draft, with independently
passing Android regressions but existing website dependency-audit blockers.

## v15.3 provider vote notification receipts

MultiBump can now passively observe the official DiscordInvites New Vote
Discord-webhook event *after one-time setup*. It requires exact guild, channel,
webhook ID, and vote-message phrase; only the numeric webhook ID is saved,
never the URL/token. Receipts are stored and deduplicated separately from
bump schedules and from the owner's local self-reported vote clock.

The event proves only that the trusted configured Discord webhook posted the
matching notification; it does not identify the current account's vote or
establish a cryptographically signed provider response. No automatic vote is
submitted. The Android menu offers the one-time setup under option 8 → 1.
See `tools/multibump-android/README.md` for setup and limitations.

## v15.4: TheDiscordList official server voting (November 17, 2026)

Seven directories are now represented in the vote support UI: six existing
bump profiles plus TheDiscordList as a separate, vote-only profile.

The owner can activate the vote-only profile in Termux with menu 8 → 1.
TheDiscordList's official bot is 1522501063456985179; members run
`/upvote` within their own server every 12h. This avoids opening a browser
for each **vote** but is not unattended user-account automation. The owner
still must authorize the bot's Discord installation and create/claim an
active TheDiscordList listing.

The provider's documented `listing.upvoted` event is available through
webhooks. Menu 8 → 2 configures an official Discord-webhook **notification
observer**, storing only numeric webhook identity and event observations,
not secret URL/token, voter accounts, or self-reported owner eligibility.
It is separate from existing bump dispatch and D-INVITES notifications.
`tools/multibump-android/VOTE_PROVIDER_APIS.md` records exact official
API endpoints and other provider blockers. TheDiscordList also publishes
a read-only/search MCP interface, not a vote-submission tool.

A live vote and official webhook-event delivery remain unverified; the
branch must not be advertised as full automatic voting or merged solely
because offline tests pass.
