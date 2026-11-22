# MultiBump direction and correction status

Updated 2026-11-22. Objective: let other servers use the original automatic
human-account bumper, preserving its slash-command execution and existing
settings. The inviteable MultiBump bot/reminder replacement is withdrawn.

## Root cause and repository

The public-service proposal changed the core execution method to an official
Discord bot. That bot could manage reminders and confirmations but could not
perform the existing human account's third-party bump commands. The owner
explicitly rejected that change. This correction extends existing draft
PR #67 on `feat/multibump-free-vote-tracker-20261117`; no duplicate PR exists.

- Removed the separate `apps/multibump/` implementation, its tests, and its
  dedicated CI job from the proposed delivery. Prior commits preserve the
  withdrawn work; no branch history was rewritten.
- Restored the site's original signed TDL verifier before the public-service
  generalization. The private Shield manager remains separate and unchanged.
- Preserved the original Android client, six bump presets, saved-login flow,
  persisted queue/cooldowns, public confirmation observer, provider vote
  notices, and separately opted-in TDL `/upvote` scheduling. Only its stale
  introductory documentation was corrected; no transport/schedule behavior
  was changed by this correction.
- Kept the dependency lock/audit and browser compatibility fixes already
  validated in CI. The existing navigation lifecycle regression remains.

## Cloud and Discord state

- Disabled all cron triggers on the dedicated `multibump-public` Worker and
  verified the API returns an empty schedule list.
- Detached `bump.the420lobby.com` from that Worker and verified no custom
  domain remains attached to it. Do not direct users to its retired install
  flow or request MultiBump bot/OAuth credentials for this objective.
- Workers.dev and preview URLs are disabled, verified from the Worker API.
- The separate Worker, dedicated D1, encryption key and dormant Discord
  application are retained for reversibility. They are not a working hosted
  human-account service. No existing Android config, credential or local
  SQLite data was moved or reset.
- The app's bot token and OAuth client secret were never bound to the Worker.
  Its application ID/public verification key are public metadata only.
  The temporary credential-transfer key has been discarded.

## Validation and limits

Correction checks passed: 144 Android offline tests, Python compilation,
all six launcher/install shell syntax checks, 114 website Node regressions,
TypeScript checking, production static/arcade build and a dependency audit
with zero vulnerabilities. The original scheduler/transport files compare
unchanged with pre-conversion commit `5d02559`; the only Python difference
is the corrected TDL module docstring. No removed public-service imports
remain in runtime code or CI.

Previous exact-head run `45071022710` passed Android, signed TDL webhook, independent
website build/typecheck/backend, and withdrawn public-service checks. The
broader website job failed only at a full-page screenshot capture timeout
in `tests/browser-smoke.mjs:462`; do not call the full workflow green.

No live Android, human-account login, bump, upvote or public hosted-service
acceptance was performed in this correction. Existing source regression
checks cannot establish provider acceptance. PR #67 stays draft/unmerged.

## Next

Keep the existing human-account transport as the product requirement.
Current Easy Mode already accepts multiple server/channel message links and
preserves independent service schedules. Instructions are in
`tools/multibump-android/README.md`. Resolve whether the requested public
service runs through the owner's existing account or each server owner's
own account before designing hosting or collecting any new credentials.
Do not resume the inviteable-bot activation path.
