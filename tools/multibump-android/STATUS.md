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

