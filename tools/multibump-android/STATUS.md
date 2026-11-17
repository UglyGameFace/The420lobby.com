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
