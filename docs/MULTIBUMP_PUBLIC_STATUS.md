# MultiBump Public status

Updated 2026-11-22. Objective: an inviteable public service with per-server settings, mobile dashboard, supported bump confirmations and signed vote receipts.

## Repository and integration

- Work extends the existing MultiBump PR #67, branch `feat/multibump-free-vote-tracker-20261117`; no duplicate PR or feature branch created.
- Current main inspected: `45c2a853ba4dde12a39ad56f7c71e9d141fc8a41`. The only overlapping open PR is #67. Existing open website-art/arcade backlog issues are independent and remain open.
- Public source: `apps/multibump/`; operational/deployment instructions: its README. Private Shield, owner scheduler and Android transport retain their separate authorization and persistence.

## Finding and resulting behavior

The old manager authorizes a fixed owner and stores services without tenant ownership. Publishing it would expose a private management model. The public service uses its own Worker/D1 schema, live Discord guild-permission checks and independent OAuth credentials. Every setting, vote link, activity entry and integration secret belongs to a guild.

Implemented: server picker/install link, channel/role setup, six directory schedules, manual reports, trusted public-command confirmation parsing, restart-safe reminder claims, persisted catch-up scanning, per-server voting links, signed TDL receipt integration, permission-checked Discord setup/status/service/done/pause/dashboard commands, export/deletion and retention.

## Validation

- Public backend suite: 25 passing tests covering tenant isolation, current permissions, channel overwrites, OAuth state/session/ciphertext boundaries, signed interaction/deferred/replay handling, signed TDL receipts, vote links, reminder concurrency/failures and polling catch-up/edits.
- Existing site regression suite and typecheck/build passed before the final additional public cases; rerun exact final tree before recording completion.
- Existing Android offline suite passed; its code is unchanged by the public implementation.
- Root and standalone public-tooling security audits: zero reported vulnerabilities. New root lockfile pins the previously unpinned transitive dependency graph, including patched picomatch 4.0.7. CI now uses `npm ci`; no advisory suppression introduced.
- Standalone Worker dry-run compilation and local D1 migration passed.
- Local browser runtime is restricted (browser download denied; installed Chromium cannot create its process socket). Browser tests are included in the independent public CI job; do not claim responsive acceptance until that job actually passes.

## Production and remaining blockers

- Created dedicated `multibump-public` D1 database `fe41c813-2d54-4d55-bd25-485440a9695f` and applied/verified all public tables and the standard migration ledger. No Lobby/Shield database tables were changed by this provisioning.
- Discord Developer Portal is at its sign-in page. No dedicated public application's credentials are available. No app/bot creation, Discord installation, live reminder, provider confirmation or real vote receipt is verified.
- Keep PR #67 draft and distinguish a deployed launch-pending website from an operational Discord service. Do not retire its branch until its work is safely integrated.
- Next: finish exact-tree CI/browser acceptance, deploy and verify the public Worker/domain in launch-pending state, then connect the dedicated Discord application and run the live acceptance in the README. Update this record with actual deployment/version and check results.
