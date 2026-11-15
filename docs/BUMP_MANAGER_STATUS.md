# MultiBump project status

Updated 2026-11-15

## Objective
Provide versioned source and offline regression coverage for the standalone Android v14 cooldown observer, while maintaining the separate owner-gated cloud manual-reminder manager.

## Evidence and implementation
- Repository: `UglyGameFace/The420lobby.com`; existing PR #64 branch `feat/bump-manager-cloud-scheduler-20261114`.
- Cloud manager: unchanged owner-only dashboard + D1 state + manual reminders through a webhook, never automated `/bump`.
- Android v14: 34 source, documentation and test files under `tools/multibump-android/`. Includes public-message confirmation observer, persisted shared SQLite cooldown floor, bounded restart history scan, and nonconfirmation safeguards.
- Website build: curated `scripts/build-static.mjs` list does not publish any file under `tools/`.
- No login token, `.env`, personal configuration, or SQLite data committed. The standalone client still uses an unsupported Discord user account automation library.

## Validation
- Pre-GitHub v14 archive: `python -m unittest discover -s tests -q` passed 99 offline tests on Python 3.13.
- Existing cloud manager PR head `993994a260ace3ebcba287ea60fc79f8912bc966` passed GitHub Actions run `43655416435`.
- CI now runs the v14 Python suite on subsequent PR heads; **do not assume CI passed on the new head until its run finishes**.
- No production Android, Discord, Cloudflare Worker, private D1, or external webhook verification established for these changes.

## Known limitations and deployment
- Public confirmations may be missed due to private/ephemeral responses, permission gaps, inaccessible history, changed bot templates, service-specific cooldown semantics, or races.
- Android SQLite scheduling and Cloudflare D1 reminder scheduling are **independent**; they do not share a state machine or provide universal duplicate prevention.
- Discord forbids self-bot automation on user accounts; this source archive does not change policy compliance.
- PR #64 remains a draft until release readiness is established. Production Pages owner ID and reminder webhook secret are missing/unverified. Do not apply remote migrations, deploy the Worker, or merge into a deploy-triggering main branch as a substitute for missing production prerequisites.

## Next
- Confirm CI on the exact new PR head, then reconcile review and any deployment blockers.
- Activate the cloud reminder manager only with production setup and real end-to-end verification.
- Verify v14's shared-cooldown observer against real public confirmations on the device; retain conservative status for opaque provider outcomes.
