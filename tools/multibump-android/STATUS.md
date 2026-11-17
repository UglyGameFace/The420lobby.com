# MultiBump v14 status — November 15, 2026

## Goal
Avoid duplicate attempts after another member manually bumps a configured directory service, without replacing the existing v13 Android installation or any saved state.

## Implemented and tested offline
- Read-only public confirmation observer, restricted by bot author, guild, channel, valid creation timestamp, and configured success evidence.
- History reconciliation before the scheduler starts, repeated on reconnect; 200-message bounded scan per channel with explicit failure/truncation logs.
- Separate SQLite shared cooldown floor and deduplicated source message ID; never reduced by local results or process restarts.
- Public counter/status-only messages are not automatically new confirmations; an explicitly server-wide next-eligible timestamp is tracked separately.
- Status screen shows public confirmations and current shared hold; Termux install scripts copy the new helper without replacing configuration, login or SQLite state.
- v14 offline tests passing (run the bundled suite for the exact result). No live Discord, Android, or PRoot verification in this session.

## Inherent limitations
- Missing/private/ephemeral announcements, unavailable history, changed bot message templates, race conditions, and directory-specific per-user versus server-wide cooldowns cannot be fully inferred from public messages.
- Discord prohibits user-account self-bots. This feature does not conceal the automation or make it compliant.

## Android upgrade
Stop the current bumper using Ctrl+C, download `MultiBump-v14.zip`, then run:

```bash
cd ~/storage/downloads && unzip -oq MultiBump-v14.zip && bash multibump-selfbot/easy-install.sh
```

Choose 3 for read-only status, or 2 to start. Running `multibump` later reopens the menu.


## v15 free directory voting — November 17, 2026

- Added independent SQLite-backed, per-provider account eligibility tracking,
  HTTPS listing validation and explicit self-reported vote recording.
- Android menu option 8 opens the dedicated vote controls; `multibump-votes`
  launches them in a second Termux session without stopping MultiBump.
- User's Discordify listing is prefilled; Discadia and custom directories
  require real listing links. The website, not this client, authenticates and
  casts each vote.
- Installer copies new tracker and launcher while retaining all existing
  bump configuration and SQLite data. No cloud manager synchronization.
- Regression tests added for provider-wide cooldowns, persistence, link safety,
  no false confirmation, and legacy bump database compatibility.
- Release is **not** confirmed live: require exact-head CI and Android manual
  vote acceptance verification. Automated voting is intentionally unsupported.

## v15.2: correct auto-voting scope (November 17, 2026)

- Root cause of misleading v15.1: it only listed a single hard-coded
  Discordify vote page and labeled an external browser handoff as voting support.
- Main menu 8 and status now inspect all six configured application IDs,
  distinguishing *server votes* from OneBump bot votes and bump-only services.
- No browser opens when inspecting status. Old manual vote history is retained
  explicitly as a separate optional tool and is never treated as verified.
- No real auto-submit endpoint has been verified/authorized. DiscordInvites
  explicitly prohibits automated votes. No requests to unauthorized endpoints,
  user-token automation, or invented successful votes are added.
- Full offline regression and exact-head CI must pass before considering merge.
- Website npm dependency audit, real Android validation, and provider
  authorization remain separate blockers. This PR must stay draft until scope
  is reconciled with the owner's original automatic voting goal.

## v15.3: provider notification support (November 17, 2026)

- An optional D-INVITES / DiscordInvites official vote-event notification
  observer now validates the exact configured Discord webhook identity,
  channel, guild, age, and customized vote-event phrase.
- Each matching event is stored once in a separate append-only SQLite table
  with bounded history reconciliation on reconnect. It never changes the
  bump dispatcher or owner vote eligibility. No user/member identities stored.
- The Android setup wizard accepts a private Discord webhook URL using hidden
  input and persists only its numeric ID, never the URL token.
- The observer is off when not configured. Offline tests cover the full
  synthetic Discord event path, spoofed IDs, duplicates, restart persistence,
  scheduling isolation, and secret handling.
- Notifications are **provider-reported events**, not cryptographic vote
  proofs and not automated vote submission. The original vote-auto-cast goal
  is blocked by vendor API/terms, not marked complete.

## v15.4: official TheDiscordList vote-only integration (November 17, 2026)

- Registered an independently configured `vote_services` profile for the
  official TheDiscordList bot (application 1522501063456985179). An owner
  chooses menu 8 → 1 once for a configured guild; it never joins the bump
  dispatcher's `services` array or issues `/upvote` as a user.
- Official member `/upvote` counts once per server/member every 12h after
  the bot is installed and the server listing is public. Both installation
  and listing ownership remain user-controlled Discord actions.
- Optional TDL `listing.upvoted` provider event webhook: menu 8 → 2;
  filters exact guild, channel, webhook ID, creation date and message text;
  append-only deduped provider notices separate from D-INVITES and bump state.
  Only the numeric webhook ID is persisted, never the webhook token.
- Seven-provider verified API/policy matrix is documented in
  `VOTE_PROVIDER_APIS.md`. TDL's signed JSON and bot stats endpoints do
  not grant automatic user vote submission. The directory prohibits
  scripted ranking manipulation.
- Added regression tests for one-guild and multi-guild opt-in, idempotent
  settings, source checking, no automatic transport, and private webhook
  configuration. TDL live webhook formatting and provider acceptance
  require on-device verification.
- Status: implementation validated in offline Android CI; website npm
  security audit remains a separate failure; PR draft, not production-live.
