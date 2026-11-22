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

- Public backend suite: 26 passing tests covering tenant isolation, current permissions, channel overwrites and actor visibility, OAuth state/session/ciphertext boundaries, signed interaction/deferred/replay handling, signed TDL receipts, vote links, reminder concurrency/failures and polling catch-up/edits.
- All 139 root Node regressions pass on the final implementation, including the 26 public cases. Site typecheck/build and both Worker compilations pass.
- Existing Android offline suite passed; its code is unchanged by the public implementation.
- Root and standalone public-tooling security audits: zero reported vulnerabilities. New root lockfile pins the previously unpinned transitive dependency graph, including patched picomatch 4.0.7. CI now uses `npm ci`; no advisory suppression introduced.
- Standalone Worker dry-run compilation and local D1 migration passed.
- GitHub Actions run `45056560204`, source `78d7be363d978fc434fe80d5790283bc1866509d`: public job passed its backend suite, security audit, Worker build and setup/service/report/pause/tenant browser flows at 320/390/768/1440px. This is fixture-backed browser validation, not live Discord acceptance.
- That run also passed Android, signed-webhook and independent site jobs. The original broader website job reached its browser-tool install and failed because Playwright 1.56.1 does not support the current Ubuntu 26.04 runner. Root tooling now pins Playwright 1.65.1 (the version used successfully by the public job); no checks are suppressed. Implementation source `2ca4eca001a7af46261824086691433b8708459d`, run `45056980750`: public job passed again (26 backend tests and all four browser sizes); Android, signed-webhook and independent site jobs passed. The broader site job passed its updated browser install, manager/arcade/Spark checks and Chromium/Firefox/WebKit checks, and was still running its final responsive smoke step at this checkpoint. Do not claim the entire workflow green from that partial result.
- Local browser runtime is restricted (download denied; installed Chromium cannot create its process socket). Remote CI is the browser acceptance route; public screenshots are retained as workflow artifacts.

## Production and remaining blockers

- Created dedicated `multibump-public` D1 database `fe41c813-2d54-4d55-bd25-485440a9695f` and applied/verified all public tables and the standard migration ledger. No Lobby/Shield database tables were changed by this provisioning.
- Public Worker deployment `89e451132c4f46fe8b3426e1c2270e5e` serves `https://bump.the420lobby.com` from implementation source `2ca4eca001a7af46261824086691433b8708459d`. The custom domain is enabled and its D1 binding and encrypted key were re-read. HTTPS homepage/client/health return successfully; health reports `database:true`, `discordConnected:false`, `status:setup_pending`. Session returns `ready:false` and installation returns 503 until the app is connected. Minute cron is configured; the first production heartbeat was still pending when checked six minutes after provisioning (trigger propagation can take longer). No scheduler delivery is claimed.
- Discord Developer Portal is at its sign-in page. No dedicated public application's credentials are available. No app/bot creation, Discord installation, live reminder, provider confirmation or real vote receipt is verified.
- Keep PR #67 draft and distinguish a deployed launch-pending website from an operational Discord service. Do not retire its branch until its work is safely integrated.
- Next: finish the broader website CI check, connect the dedicated Discord application and run the live acceptance in the README. The implementation is deployed and its encryption key was verified preserved after updating it. No live Discord behavior can be validated before that connection.
