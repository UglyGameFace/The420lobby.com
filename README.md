# The 420 Lobby
**Website:** https://the420lobby.com  
**Discord:** https://discord.gg/the420lobby  
**Cloudflare Pages project:** `the420lobby-com`

## Active task: Sesh Signal community arcade

PR #3's custom smoke branding is already in production `main`. This feature adds a fully playable, standalone 42-second 420-themed arcade game as the next single active task, without modifying Dank Shield or claiming any live Discord integration.

**Rules:** Collect drifting green smoke (+10 plus combo), grab rare gold clouds (+40), avoid violet static (-15 and combo reset). After charging the meter, activate five seconds of double-point Chill Mode. Tap on Android or navigate targets with keyboard Tab/Enter. Press B with focus inside the playfield to activate the boost.

**Results:** Show round score, combo, elapsed time, personal best, player tier, and optional share/copy to Discord. The best score is stored only in this browser's localStorage and may disappear if storage is cleared. No account, analytics SDK, leaderboard backend, prize, or permission to affect Discord roles is involved.

**Reliability:** One requestAnimationFrame loop runs only while a round is active. The round automatically pauses if the tab/app goes to the background. Personal best reads/writes are guarded for privacy modes that block storage. Optional sound is disabled by default, gameplay works without WebGL, targets are native buttons and moving targets slow down when reduced-motion or Save-Data is enabled.

### Architecture / ownership
- `index.html`: semantic content, internal links, verified Discord invite, no invented stats or Minecraft ports.
- `styles.css`: sole authoritative theme and layout stylesheet. Responsive and reduced-motion designs included.
- `script.js`: the marketing site's DOM interaction and scroll/parallax coordinator.
- `sesh-signal.js`: independent mini-game state, local scoring, one animation loop, share/copy and optional sound. No server calls.
- `sesh-signal-v2.css`: the **sole** Sesh Signal arcade stylesheet, linked independently from the marketing site's `styles.css`. It uses a new URL to prevent stale site CSS caches from rendering arcade controls as raw text. Version its filename on future breaking visual changes.
- `visual-engine.js`: GPU WebGL shader, owned behind `window.LobbyAtmosphere`. No Three.js download, CDNs, or build step. Shader falls back to CSS if WebGL is unavailable.
- `assets/haunted-lounge.svg`: existing atmospheric CRT gaming illustration, retained as visual background only. Its filename is legacy; no haunted-house copy is promoted.
- `assets/smoke-420.svg`: procedural vapor lettering formed by turbulence, displacement, feathered clouds, and translucent density, deliberately replacing the clipping-paper CSS brand mark.
- `assets/botanical-leaf.svg`: seven individual serrated leaflets, veins, tapering and a stem, not generic blade shapes.
- `favicon.svg`: existing icon, unchanged in this scope.
- `tests/site.test.mjs`: static regression checks.
- `tests/browser-smoke.mjs`: Chromium acceptance tests, including real arcade taps, score changes, pause/resume and restart on mobile sizes.

### Performance safeguards
- WebGL only while the hero is onscreen and tab visible; animation loop pauses on tab visibility change.
- GPU resolution capped and reduced for mobile, with low-power context and 25/35 FPS targets.
- System reduced-motion and save-data preferences disable nonessential motion.
- User effects control available when supported.
- All critical content remains visible without JavaScript and without WebGL.
- Assets are SVG and no large background video, heavy JS framework, WebGL dependency, database or tracking SDK is required.

### Deployment
Existing Pages project is linked to GitHub `main`, with **no build command** and `.` output directory (repository root). Do not change that configuration for this redesign.

1. Open/verify pull request; let GitHub Actions validate the exact head.
2. Review Cloudflare's PR preview if enabled, and check Android browsers, desktop, effect-toggle behavior, scrolling, and Discord invite CTA before merging.
3. Merge the PR to `main` after acceptance. Cloudflare then deploys the same static files automatically.
4. Validate `https://the420lobby.com`, `https://www.the420lobby.com`, and email continuity. Do not modify domain DNS for visual changes.

### Local tests
With Node.js 20 or newer:

```sh
node --check script.js
node --check visual-engine.js
node --check sesh-signal.js
node --test tests/site.test.mjs
```

Runtime visual checks in multiple browsers are still necessary. WebGL shader compilation, mobile GPU drivers and battery behavior cannot be proven by a static source test.

## Website ↔ Discord/Minecraft integration backlog (not implemented in this redesign)

Sesh Signal is now implemented as a **local-only mini-game**. Direct Discord/Minecraft integration remains the next task, not part of the arcade PR. Never invent member rewards, public counts or cross-service authentication. Changes to Dank Shield need separate authorization and integration tests.

Suggested delivery order:

1. **Optional live Discord status**: If the server owner explicitly enables the Discord Server Widget, use Discord's `/guilds/{guild.id}/widget.json` and a rate-limited/cache-aware Cloudflare Pages Function to display a meaningful *online presence count* without exposing individual member names, channel lists or private moderation data. Use no guessed guild ID. Show "Status unavailable" when disabled. Keep private/staff channels hidden.
2. **Bot capability highlights**: Publish only approved, aggregated, read-only nonprivate Dank Shield diagnostics through a documented authenticated bot-to-site contract with caching, no public bot token, no admin endpoints exposed.
3. **Minecraft status**: After the new IP and protocol/port are verified, use a bounded server-side proxy or signed lightweight plugin heartbeat to surface truthful availability and Java/Bedrock compatibility. Never embed secrets in client JS and never hardcode the old address.
4. **Events/announcements**: Public, permission-filtered Discord scheduled events and community changelog, with caching and explicit privacy review.
5. **Member portal** (only if truly needed): Discord OAuth2 with server-side token handling, account-scoped permissions, access controls, and abuse protection. Do not build this before the read-only integration is proven stable.

All live data should explicitly label stale/unavailable status. Keep Cloudflare Pages lightweight and do not make Dank Shield production runtime dependent on the marketing website.
