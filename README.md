# The 420 Lobby
**Website:** https://the420lobby.com  
**Discord:** https://discord.gg/the420lobby  
**Cloudflare Pages project:** `the420lobby-com`

## Active task: Haunted Lobby v3 redesign

The previous live site looked like a nightclub/generic gaming template. This branch changes the authoritative static site into an original haunted gaming lounge with a proper seven-blade serrated cannabis emblem, an illustrated spectral gaming room, scroll-linked reality distortion, 3D hover depth, and a WebGL spectral fog engine.

### Architecture / ownership
- `index.html`: semantic content, internal links, verified Discord invite, no invented stats or Minecraft ports.
- `styles.css`: sole authoritative theme and layout stylesheet. Responsive and reduced-motion designs included.
- `script.js`: sole DOM interaction and scroll/parallax coordinator.
- `visual-engine.js`: GPU WebGL shader, owned behind `window.LobbyAtmosphere`. No Three.js download, CDNs, or build step. Shader falls back to CSS if WebGL is unavailable.
- `assets/haunted-lounge.svg`: original bespoke creepy CRT + gaming controller artwork.
- `assets/botanical-leaf.svg`: seven individual serrated leaflets, veins, tapering and a stem, not generic blade shapes.
- `favicon.svg`: original glowing ghost.
- `tests/site.test.mjs`: static regression checks.

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
node --test tests/site.test.mjs
```

Runtime visual checks in multiple browsers are still necessary. WebGL shader compilation, mobile GPU drivers and battery behavior cannot be proven by a static source test.

## Website ↔ Discord/Minecraft integration backlog (not implemented in this redesign)

The user wants actual server integration after this visual redesign is validated. Treat it as the *next* implementation task, not an excuse to modify Dank Shield while the redesign is in progress.

Suggested delivery order:

1. **Optional live Discord status**: If the server owner explicitly enables the Discord Server Widget, use Discord's `/guilds/{guild.id}/widget.json` and a rate-limited/cache-aware Cloudflare Pages Function to display a meaningful *online presence count* without exposing individual member names, channel lists or private moderation data. Use no guessed guild ID. Show "Status unavailable" when disabled. Keep private/staff channels hidden.
2. **Bot capability highlights**: Publish only approved, aggregated, read-only nonprivate Dank Shield diagnostics through a documented authenticated bot-to-site contract with caching, no public bot token, no admin endpoints exposed.
3. **Minecraft status**: After the new IP and protocol/port are verified, use a bounded server-side proxy or signed lightweight plugin heartbeat to surface truthful availability and Java/Bedrock compatibility. Never embed secrets in client JS and never hardcode the old address.
4. **Events/announcements**: Public, permission-filtered Discord scheduled events and community changelog, with caching and explicit privacy review.
5. **Member portal** (only if truly needed): Discord OAuth2 with server-side token handling, account-scoped permissions, access controls, and abuse protection. Do not build this before the read-only integration is proven stable.

All live data should explicitly label stale/unavailable status. Keep Cloudflare Pages lightweight and do not make Dank Shield production runtime dependent on the marketing website.
