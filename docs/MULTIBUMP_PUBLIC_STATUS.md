# MultiBump Public status

Updated 2026-11-22. Objective: a public Discord service with per-server setup, a mobile dashboard, reminders, supported bump confirmations and signed vote receipts.

## Delivery and repository

- Source lives in `apps/multibump/`; activation and operating instructions are in its README.
- Work extends PR #67 on `feat/multibump-free-vote-tracker-20261117`. Main inspected as `45c2a853ba4dde12a39ad56f7c71e9d141fc8a41`; no conflicting public-service PR or review threads were found. Independent website backlog issues remain open.
- The public Worker/database are separate from private Shield, the original owner scheduler and the Android transport. No private schedules were copied into public tenants.
- Implemented: live Discord management-permission checks on tenant APIs; actor-visible channel selection and bot permission checks; isolated schedules/roles/voting links; signed deferred setup/service/status/done/pause/dashboard commands; trusted confirmation parsing and persisted history catch-up; atomic reminder claims; signed tenant-specific TDL receipts; export/deletion and retention.

## Verified production state

- `https://bump.the420lobby.com` is attached to Worker `multibump-public`. Deployed executable source is `2ca4eca001a7af46261824086691433b8708459d` (initial deployment `89e451132c4f46fe8b3426e1c2270e5e`; subsequent secret-binding updates retain that code).
- Dedicated D1 `multibump-public`, UUID `fe41c813-2d54-4d55-bd25-485440a9695f`, has all tables and `0001_public.sql` in the standard migration ledger. The encryption key is an encrypted Worker secret and was verified preserved after updating the Worker.
- HTTPS homepage/client/health checks pass. The minute cron now records a production `last_tick` heartbeat. Zero servers are configured; no live reminder delivery is claimed.
- Discord application **MultiBump** was created under the owner's Personal account after explicit approval of the Developer Terms of Service and Developer Policy. Application ID: `1574167873386053712`.
- Its app ID and public verification key are bound to the dedicated Worker. Discord accepted/saved `https://bump.the420lobby.com/api/discord/interactions`, verifying the signed PING handler.
- Discord saved OAuth callback `https://bump.the420lobby.com/auth/callback`, the public description, and privacy/terms links. Guild Install is enabled, User Install disabled, with `bot` + `applications.commands` and View Channels/Send Messages/Embed Links/Read Message History defaults (`84992`).

## Validation and CI

- All 140 Node regression tests pass locally, including 26 public backend tests and a navigation lifecycle regression. Site typecheck/build, Android offline suite, public Worker compilation, local/remote D1 migration and both dependency audits passed.
- Root and public-tooling lockfiles pin patched picomatch 4.0.7 and current Playwright 1.65.1. CI uses `npm ci`; no audit suppression was introduced.
- Public-service CI passed on implementation source `2ca4eca` and later heads, including workflow `45068118177`: backend tests, audit, Worker build and complete dashboard fixture flows at 320/390/768/1440px. Android, signed-webhook and independent-site jobs also passed. These are fixture checks, not live Discord acceptance.
- Earlier full-site CI failed first on unsupported Playwright 1.56.1/Ubuntu 26.04, then on an animated full-page capture timeout. The overview now uses the existing effects-off control after normal-state viewport captures and all assertions; subsequent CI passed that capture.
- Latest broader-site failure in run `45068118177` was `tests/browser-smoke.mjs:89`: the navigation closed between assertions. The real initial `pageshow` can arrive after a visitor opens navigation while other page assets are loading. The production handler now resets only BFCache restores (`persisted:true`); its initial synchronous reset is retained. A behavioral Node test covers initial-load preservation, BFCache restore, outside click, Escape and desktop resize. The browser fixture uses real PageTransitionEvent semantics. Await new CI before calling the entire workflow green.
- Local browser execution is blocked by the workspace browser sandbox. Remote CI is the acceptance route and retains screenshot artifacts.

## Remaining activation and next step

- Bot token and OAuth client secret are not yet bound. Discord exposes these only after **Reset Token** / **Reset Secret**; credential resets must be completed by the owner in the browser. Do not ask for plaintext credentials in chat or commit them. An ephemeral encrypted transfer has been tested for copying the credentials directly into the dedicated Cloudflare secret store without printing plaintext.
- Message Content Intent is currently off. The owner must approve/enable it before public-message confirmation observation can work. Presence and Server Members intents are unnecessary.
- The public homepage correctly stays launch-pending and `/install` returns 503 until the complete app configuration exists. The app is created; the public Discord service is not yet operational.
- Next: owner completes the bot-token reset/copy (and Message Content setting), securely bind `DISCORD_BOT_TOKEN`; repeat for OAuth `DISCORD_CLIENT_SECRET`; register commands; verify OAuth and two independently managed server installations, permissions/reminders/pause, a real public bump confirmation and an authentic signed TDL vote receipt.
- Keep PR #67 draft/unmerged until activation and live acceptance are complete. Preserve its unmerged branch. No live Discord installation, command, reminder, bump confirmation or vote receipt has been verified.
