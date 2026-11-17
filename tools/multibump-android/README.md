# MultiBump Easy Mode (Android / Termux)


## V15: vote in one action

From the main MultiBump screen select **8. Vote for The 420 Lobby (free websites)**.
The first choice is ready immediately:

1. **The 420 Lobby on Discordify**. Select **1** to open the official listing in your Android browser. No prior setup, URL, channel ID, or Discord token is required.
2. Tap **Vote Now** on Discordify. You may need to sign in to that website with Discord.
3. Return to the existing Termux prompt. Enter **y** only after the website confirms the vote succeeded. MultiBump records your confirmation and shows the next local 24-hour check time.

If the website rejected or did not confirm the vote, press Enter instead. No vote is counted, no timer is started, and no bump schedule changes. Local voting status is **not** a verification of the website's vote totals.

Other directories appear as additional numbered choices after being added once. The two advanced actions at the bottom are **Add another free voting website** and **Remove a saved voting website**.

**To keep bumping while you vote**, open a second Termux session and type \`multibump-votes\`. Voting opens the official site. It does not attempt automatic OAuth, website vote submission or vote verification.


## v15: free server-directory votes (Android)

MultiBump now includes **free directory voting alongside bumping**. This is a
separate **manual, account-level 24-hour vote ledger**, not an automatic vote
sender. Opening a listing or completing Discord OAuth **never** marks a vote
successful. Only record it after the directory visibly confirms the vote.

- **Option 8** in `multibump`: one numbered choice opens the prefilled
  Discordify listing. Confirm success when you return; adding another directory
  is optional.
- **`multibump-votes`** in a *second Termux session*: use the vote menu while the
  original bumper continues to run. No credentials, database reset or cloud
  manager connection is needed.
- **Discordify** has a free server vote once per 24 hours *across all servers*
  for that account. The 420 Lobby's owner-supplied official listing URL is the
  default: `https://discordify.net/server/the-420-lobby`. The user completes
  Discord sign-in and votes on the real website.
- **Discadia** has free directory voting; paste the URL of your own specific
  server listing. Other free voting directories can be added with an HTTPS
  listing and their documented account cooldown (24-168 hours).
- All account-level votes for the *same directory* share one clock across
  multiple server listings. Different directories have separate clocks.
- Bump `schedule`, public bump cooldowns, command timers, and shared send
  queue are unchanged. The vote ledger is stored in separate
  `vote_state`/`vote_events` tables in the existing private SQLite database.
- MultiBump cannot verify a vote externally without a provider-authorized,
  user-scoped confirmation API. Status is explicitly labeled **self-reported**.
  No hidden website endpoints, captcha bypass, automated OAuth, fake votes or
  multi-account vote farming are attempted.

**Update an existing Termux installation from GitHub main** (this preserves
`config.json`, your saved login and `bump_state.sqlite3`):

```bash
pkg install -y git
cd "$HOME"
if [ -d multibump-source/.git ]; then
  git -C multibump-source pull --ff-only
else
  git clone --depth 1 https://github.com/UglyGameFace/The420lobby.com.git multibump-source
fi
bash "$HOME/multibump-source/tools/multibump-android/easy-install.sh"
```

The old v14 ZIP instructions below apply only to the earlier package. To get
vote support, use the updated repository source once this change is on main.


**Once set up, type `multibump` for bumps or `multibump-votes` for voting in another Termux session.** No need to use Python filenames, remember a folder, edit JSON, or reinstall Debian.

## Upgrade from previous MultiBump (keeps your settings)

1. Stop the running bumper with **Ctrl+C**, then choose **0** to exit the menu.
2. Download `MultiBump-v14.zip` in your phone's Downloads folder.
3. Paste this whole block into Termux:

```bash
cd ~/storage/downloads &&
unzip -oq MultiBump-v14.zip &&
bash multibump-selfbot/easy-install.sh
```

It updates the existing scripts, preserves `config.json`, saved login and `bump_state.sqlite3`, reuses a healthy Debian installation, installs a `multibump` launcher command, and opens the easy menu. Choose **2** to start the updated scheduler.

**After that, only type:**

```bash
multibump
```

## How the menu works

- `1. Add multiple bump bots`: select several by typing `1,2,4` or other numbers. Copy the link to **one message inside your bump channel** in Discord and paste it when requested. The program obtains server and channel IDs from the link; you don't need to look up both IDs separately. Presets populate the bot application IDs and `/bump` command automatically. Discodus needs its actual cooldown entered; custom bots need their own ID and cooldown.
- `2. START bumper`: launches Debian. On the first start, you may **opt in** to saving the credential in Termux private storage. Subsequent starts reuse it, without asking again. The token is saved as a 600-permission plain-text file (not encrypted), never in the ZIP or `config.json`. Declining keeps the hidden prompt every time. Press Ctrl+C to stop and return to the menu.
- `3. View status`: shows the extra wait range, next eligible times, last attempt/confirmation, **per-service and total 24-hour outcomes**, and connection-recovery counts. Reads SQLite without changing the schedule.
- `4. Edit / remove services`: advanced settings if needed.
- `6. Saved login (change / forget)`: replace or remove the credential from this phone.
- `5. Add Discordify + D-INVITES`: add them both to the existing bump channel without IDs, links, or a token prompt. This is safe to repeat and does not create duplicates. With multiple configured servers, it asks for the right location.
- `7. Timing (extra wait after cooldown)`: adjust the minimum and maximum extra minutes. Defaults work automatically with existing settings; no setup is needed.

## Variable timing in v10

- Each new cycle chooses **2–17 extra minutes** after that service's required cooldown. A two-hour service therefore waits about **122–137 minutes**; a daily service waits about **24 hours + 2–17 minutes**. Response handling and the 30-second scheduler check can make an attempt later.
- New services wait 15–180 seconds before becoming eligible. A shared, saved queue spaces command starts by at least 45–150 seconds. Multiple overdue services resume one at a time rather than sending a burst.
- The chosen delay and queue spacing are saved before invocation. Polling, a crash or restarting does not draw a fresh deadline or clear the cooldown.
- Existing fixed timers are extended once during upgrade. Existing history, blocked services, configured bots and saved login are kept.
- A visible cooldown response uses the wait reported by that service, plus the chosen extra delay. Missing confirmation is logged as **no_confirmation**, not a success; a readable but unrecognized reply is logged as **response_seen**. Both honor the full configured cooldown.
- This is randomized scheduling with cooldown rules, not an AI making human decisions. It cannot establish whether an invisible response succeeded or guarantee external services will accept commands.

`Timing` settings apply when reserving a new cycle. Changing them does not move an already-saved deadline earlier. The terminal logs each next attempt time in UTC with a countdown; option 3 uses the phone's local time. An expired deadline is shown as **ready now**, not a future appointment.

## v14: observe public bumps by other server members (best-effort)

- Before sending, scans **recent visible messages** in the configured bump channel, then watches new messages and bot edits for configured directory-bot confirmations. Only messages authored by the configured directory bot in the correct guild and channel count. A reply explicitly linked to your own account is excluded.
- Public success announcements (for example DISBOARD `Bump done!`, Discodus `Bump done!`, and Discadia `bumped. +1 Boost earned`) create a separate durable **public hold**. This hold is the later of the configured cooldown and a visible provider next-bump time, plus at least the configured minimum extra wait (default 2 minutes), without overriding the existing local random delay. It cannot be overwritten by a local command response, an update, or a Termux restart.
- A public bot card that explicitly says **this server** can be bumped again at a future timestamp may update the shared wait without being counted as a new confirmed bump (such as Discordify's counter-only cards). Counter increases alone do not establish another user's new bump.
- Duplicate message IDs cannot be counted twice. Spoofed authors, wrong channels/servers, own known invocation, expired messages, generic stats, and cooldown refusals do not count as confirmed shared bumps. A gateway resume rescans available public history before further dispatch.
- Menu option **3** reports the public hold, last observed public success, and separate public success versus wait counts. Existing configuration, database, saved login, and timers are retained.
- **Limitations:** The client can see only public bot replies in its configured channel. It cannot inspect other people's ephemeral responses, private channels, missing messages, or more than the bounded recent-history scan. History access failures and truncation are logged; they cannot prove nobody else bumped. It is therefore **not a guarantee** against every duplicate attempt. Rules on user-account automation still apply.

## v13: real Discadia response and clearer reliability reporting

- **Discadia:** Recognizes the verified response form `The 420 Lobby bumped. +1 Boost earned` from the configured Discadia application, including an existing v12 `config.json` with outdated success patterns. A streak/boost statistic by itself is **not** evidence of a new bump. Cooldown rejection still wins over success wording.
- **Next-eligible time:** Reads explicit `Next bump <t:...>` timestamps in addition to `can be bumped again`. Applies the later of the configured cooldown or verified service-provided remaining wait, then the existing extra delay. Timestamps unrelated to next-bump availability are ignored.
- **Response safety:** Rejects edits to messages created before the command invocation. Accepts edits to new messages made during the current response window. Continues to verify the source channel and bot, plus the invoking user when Discord provides that metadata.
- **Status screen:** Menu option **3** and `python bumper.py --status` now show bot-confirmed replies, cooldown responses, replies with no success proof, and no-visible-reply attempts separately. Includes per-service last attempt and last bot confirmation. The viewer opens SQLite read-only and cannot reschedule a command.
- **Connection history:** Records gateway disconnect and resume observations (not inferred causes) without resetting deadlines. Channel/command lookup failures that occur **before** sending are now counted separately from uncertain post-send errors; only pre-send failures use the existing short error backoff. Existing SQLite schedules, queued spacing, Discordify bump-count baselines, config, and saved credential are preserved.
- **OneBump / D-INVITES:** If the service responds only with a private/ephemeral message not visible to the client, the script cannot verify the result. Such attempts remain `no_confirmation` and wait a full cooldown. v13 intentionally does not label them successful or attempt extra bump commands to probe them.

**Not a live verification:** Tests are offline. No Discord login, third-party service, or Android/PRoot installation is tested here. The client is an unofficial user-account automation tool prohibited by Discord; some listing sites also prohibit it. Timing does not change that risk.

## More reliable response evidence in v12

- Watch new bot messages **and edits** for the full response window; do not mistake a temporary empty message for final confirmation.
- Parse content and embed titles, descriptions, fields and footers; verify source channel, bot author, timing and any available interaction invoker.
- Explicit success text qualifies as `confirmed`; a reported cooldown qualifies as `cooldown`.
- Discordify running bump counts qualify as success **only after increasing** from a previously observed count. The first count builds a baseline; it is not automatically a success.
- Parse explicit Discord `<t:...>` next-bump timestamps where present and never schedule before the configured cooldown.
- If the response cannot be proven, show `response_seen` or `no_confirmation` with an explanation. Never invent a successful bump, retry immediately, or clear previous successful verification records.
- The existing SQLite state and due times are preserved during upgrades; legacy `unverified` is renamed to `no_confirmation` without advancing the schedule. No login or configuration reset.

## Wait parsing and clearer status in v11

The old parser summed every duration anywhere in a reply. For example, "wait another 78 minutes" plus "bump every 2 hours" incorrectly became 198 minutes. The new parser reads the explicit remaining wait, ignores generic interval descriptions and repeated instructions, and uses the configured cooldown if remaining-wait instructions conflict. Compound waits such as `1h23m` are supported.

Startup and attempt logs include a countdown, and overdue entries say **ready now (queued)**. Option 3 shows the last attempt time alongside the saved deadline, making older records easier to identify. Existing saved deadlines are kept; this update does not infer a replacement deadline from an incomplete earlier reply.

**Important limitations:** Only bots that accept slash commands are candidates. The preset IDs have not been live-tested in your Discord server. The program has not been tested with a real Discord account or confirmed to bump successfully. It also cannot solve website CAPTCHAs. Discord prohibits self-bots and may terminate automated user accounts.

---

## Troubleshooting and advanced setup

# MultiBump, Android build with service manager

**Discord prohibits automating normal user accounts, and listings may ban automated bumps.** This is an unofficial user-account integration, not an official Discord bot. Treat your user account as at risk. No real account login or bump has been tested by the author.

## Fix for Nov 12, 2026 Discord protobuf installation failure

**v3 was still broken**, even after getting Debian to install. Its locked `discord.py-self==2.1.0` requires `discord_protos<1.0.0`, but pip now offers only versions `1.2.x`. This revision uses a **specific, verified official upstream commit** (`2ba64a9a997e151a9c259984e0a179b1fdf4aff4`) that updated the constraint to `discord_protos<2.0.0`. It installs from source using Debian's `git`, checks all package dependencies via `pip check`, and runs the offline import diagnostic and test suite. This is a development revision (`2.2.0a`), not a release, so Discord behavior is still unverified.

For phones already at the screenshot error, retain the existing `~/multibump-selfbot` directory and Debian environment; extract this new ZIP and execute its installer from the extracted folder. The installer copies code and scripts over the old version **without replacing an existing config.json or bump_state.sqlite3**.

## Fix for earlier Android installation failures

**The original v2 ZIP was defective on Termux.** It depended on `discord.py-self>=2.0,<3`, which resolved to 2.1.0. That release depends on the compiled package `curl_cffi`. Ordinary pip installation in native Android Termux often fails because the required Android wheel is unavailable and `curl_cffi` source builds reject the Android target. Re-running `pip install -r requirements.txt` is not a fix.

This package runs the pinned development dependency under Debian Linux inside **PRoot-Distro** in Termux. Debian supplies a Linux ABI compatible with prebuilt Linux wheels. No root access or PC is required, but the initial Debian environment requires additional storage and internet access. **This Android runtime approach has not been tested on a physical Android device**; startup and installation scripts have been statically and mock tested. It is preferable to downgrading to a 2025 Discord client that may be incompatible with current commands.

## Repairing the first Debian installer issue

The initial Android ZIP incorrectly required a `container=proot-distro` environment variable. PRoot-Distro 5.x doesn't guarantee it. This revision detects Debian using `/etc/debian_version` instead. If you have **already installed Debian**, you do **not** need to reinstall it or extract again: edit the check in your existing `~/multibump-selfbot/setup-debian.sh` or extract this updated package, then run `bash install-termux.sh` once more. It preserves existing configuration and history.

## Install on Android

1. Extract `multibump-selfbot.zip`. In Termux, enter the extracted `multibump-selfbot` folder.
2. Run the installer **with bash**, not pip:

```sh
bash install-termux.sh
```

The installer copies the source to `~/multibump-selfbot` if it was extracted to Downloads/shared storage. It installs `proot-distro`, a separate Debian Bookworm system, the appropriate Python runtime, and prebuilt Linux dependencies. It does **not** delete existing bump configuration or the state database. It may require downloading a Debian image and packages.

3. When the installation completes, enter the directory printed by the installer. Typically:

```sh
cd ~/multibump-selfbot
python manage.py
```

4. In the service manager, add DISBOARD, OneBump, Discodus, Discadia, or **Custom**. Enter each bot's application ID, command, cooldown, server ID, and channel ID. Defaults help with additional services on the same server.
5. Start:

```sh
bash run-termux.sh
```

The launcher starts Debian automatically. It checks for `config.json`, starts the Debian Python runtime, and requests your account credential privately through a hidden-input prompt. It does not put the credential in source code, JSON, command arguments, or the ZIP. Do not send credentials or authentication screenshots to anyone.

For offline tools, the native Termux Python is enough:

```sh
python manage.py list
python bumper.py --check
python bumper.py --status
```

**Do not run `pip install -r requirements.txt` directly in Termux.** That was the earlier broken setup path. Use `bash install-termux.sh` instead.

## Service catalog

| Provider | Application ID preset | Cooldown default | Verification |
| --- | --- | --- | --- |
| DISBOARD | `302050872383242240` | 120 min | Preset, not live-tested |
| OneBump | `1028956609382199346` | 120 min | Preset, not live-tested |
| Discodus | `1159147139960676422` | User enters cooldown | Preset, not live-tested |
| Discadia | `1222548162741538938` | 1440 min | Preset, not live-tested |
| Discordify (D-ify.net) | `1326784586696626176` | 120 min | ID and timer confirmed via official website; not live-tested |
| D-INVITES | `678211574183362571` | **Provisional** 120 min | ID and `/bump` verified; timer not verified |
| Custom | User supplies ID | User enters cooldown | Requires per-service validation |

You can add or edit services without changing source code or JSON:

```sh
python manage.py
python manage.py catalog
python manage.py list
python manage.py add custom --name 'Another Listing Bot' --app-id BOT_APPLICATION_ID --command bump --cooldown-minutes 120 --guild-id SERVER_ID --channel-id CHANNEL_ID --yes
```

The scheduler keeps independent cooldowns and state across restarts. A visible confirmation is not guaranteed because some slash-command replies are ephemeral. Such attempts retain the full cooldown under a specific no_confirmation or response_seen status; neither is reported as successful. This implementation does not support website buttons or CAPTCHA challenges. There is no guarantee a command works just because it appears in the catalog.

## Diagnostics

In the extracted folder, the command `python doctor.py` running directly in native Termux will now **tell you to use the Debian installer** rather than misdiagnose the missing library. Once the environment is installed, check the imported dependencies with:

```sh
proot-distro login --bind "$PWD:/opt/multibump" multibump-debian -- bash -c 'cd /opt/multibump && .venv-debian/bin/python doctor.py'
```

If the installer errors, share the **first error line and command that failed**, not credentials. If the link itself says “library not found,” that is a file download problem, not a Python library problem, and requires a screenshot of that UI error.

## Validation

Source tests can run without Discord credentials:

```sh
python -m unittest discover -s tests -v
python -m compileall -q bumper.py response_reader.py status_view.py engine.py manage.py doctor.py
bash -n install-termux.sh setup-debian.sh run-termux.sh
```

The source and offline tests do not prove that Debian installed successfully on a specific phone, that Discord will authenticate, or that external bump services will accept commands.

## Verification scope

The official upstream GitHub commit and its requirement change were checked as of November 12, 2026. Automated offline tests, source syntax, and ZIP integrity can be checked without credentials. This does **not** establish that the on-device Debian install, login, or third-party bump invocation succeeds until observed on the phone. In particular, this build tracks an unreleased 2.2 alpha revision, so compatibility and API behavior are not guaranteed. Do not share account credentials or paste them in chat.


### Command-index caching (v7)

MultiBump fetches the application command index **once per channel**, caches it for six hours, and reuses it across different service application IDs. This avoids repeated requests to Discord’s heavily rate-limited command-index endpoint. A command invocation is **not** proof of a successful bump; confirmations remain service-specific, and non-confirmations remain `no_confirmation` or `response_seen`. This update preserves existing `config.json` and SQLite state.

### Add Discordify and D-INVITES (v8)

Upgrade from the ZIP using the three Termux commands above. In Easy Mode select **5. Add Discordify + D-INVITES**. This action reuses the only configured server/channel when there is one. It preserves all existing services and the SQLite bump history. Selecting this option repeatedly is safe and does not add duplicates.

- Discordify official app ID and `/bump` with 2-hour cooldown: https://discordify.net/bot/install/discordify/ and https://discordify.net/blog/discordify-the-best-disboard-alternative-for-promoting-your-server/
- D-INVITES official bot listing gives ID `678211574183362571` and `/bump`: https://en.discordinvites.net/bots/678211574183362571 . The 2-hour D-INVITES default is **provisional**, not confirmed.
- D-INVITES listing terms prohibit unauthorized automatic bumps and allow only their provider-run premium automation: https://discordinvites.net/listing-terms . Unofficial human-account self-bot usage also risks Discord account termination.

Adding a service does **not** install the corresponding provider bot in the server or prove that a command will execute. No live verification was done for the new integrations.

### One-time login option (v9)

Previous versions deliberately did not retain the account token, requiring it again after each restart. v9 asks on first Start whether to save it locally. Choosing yes creates `~/.config/multibump/token` in **Termux's app-private home directory** with file mode `0600` inside a `0700` directory. The Debian guest only reads the token using a private file bind and does not receive it as a CLI argument. It does **not** provide hardware-backed encryption; anyone with access to Termux app files (such as a rooted device or a compromised Termux installation) can read it.

Use menu option 6 to replace/forget the saved login. Credential is **not backed up or included** when sharing the application ZIP. Existing `config.json`, history and six service presets are preserved. The exact `run-termux.sh` path also works if you bypass the menu.
