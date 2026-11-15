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
