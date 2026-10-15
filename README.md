# The 420 Lobby website

Immersive, mobile-responsive public landing page for The 420 Lobby, Dank Shield, Dank Cinema, and The 420 Server.

## Current state

- Custom static website in `index.html`, `styles.css`, and `script.js`.
- Cinematic 3D portal, scroll depth, hover-tilt cards, particle field, light sweeps, glowing neon accents, and interactive signal console.
- Accessibility: skip link, keyboard-operable signal tabs and menu, motion toggle, system reduced-motion preference, no-JavaScript readable content.
- No Minecraft IP or ports are published. Waiting for updated official connection details.
- Discord invite URL intentionally not filled in until the vanity slug is clarified (`the420lobby` versus `the420lobbybur`).
- No external runtime dependency or build system. Web fonts are optional with local fallbacks.

## Cloudflare Pages deployment

1. In Cloudflare Dashboard, open **Workers & Pages → Create application → Pages → Connect to Git**.
2. Choose this repository: `UglyGameFace/The420lobby.com`.
3. Production branch: `main`. Framework preset: **None**. Build command: **leave blank**. Build output directory: **.** (repository root).
4. Deploy; open the generated `*.pages.dev` preview and test on desktop and mobile before connecting the domain.
5. In Cloudflare Pages, add `the420lobby.com` via **Custom domains**, after verifying all email DNS records.

**DNS precautions:** Northwest remains the domain registrar. Before changing nameservers, verify MX priority 10, SPF TXT, DMARC TXT, complete DKIM TXT for `postal-dytsdb._domainkey`, and the `psrp` CNAME all exist in Cloudflare, with non-proxied mail records. The old Northwest website A records still target Northwest until the cutover. Do not delete unrelated DNS records or change nameservers while the new site remains untested.

## Validation

Run `node --test tests/site.test.mjs` (Node 20+). A matching GitHub Actions workflow runs these checks on pushes and pull requests. Manual browser testing is still required for scrolling, performance, reduced-motion, navigation, and real external links.

## Before public launch

- Confirm exact Discord invite URL and replace the temporary invite placeholder with a verified external CTA.
- Insert verified Minecraft server hostname and current ports only after they are supplied.
- Test Cloudflare preview, mobile performance, links, browser accessibility, and existing DNS/mail continuity.
