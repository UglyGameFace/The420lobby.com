# The 420 Lobby website

A smoky, 420-friendly Discord gaming hub promoting The 420 Lobby, Dank Shield, Dank Cinema, and The 420 Server.

## Current state

- Custom static website in `index.html`, `styles.css`, and `script.js`.
- Custom `assets/gaming-420-world.svg` illustration: smoke, cannabis leaf badge, game controller, game UI, and block-world art. Dark forest-green and amber gaming HUD aesthetic replaces the earlier purple nightclub look.
- Scroll parallax, hover-tilt feature cards, lightweight particle field, drifting smoke, geometric game effects, and interactive lobby mode selector.
- Accessibility: skip link, keyboard-operable lobby mode tabs and mobile menu, reduced-motion preference, visual FX toggle, readable content with scripting disabled.
- No Minecraft IP or ports are published. Waiting for updated official connection details.
- Confirmed Discord vanity invite: `https://discord.gg/the420lobby`. Header, hero, community feature, and final Join CTA link directly to it.
- No external runtime dependency or build system. Web fonts are optional with local fallbacks.

## Cloudflare Pages deployment

1. In Cloudflare Dashboard, open **Workers & Pages → Create application → Pages → Connect to Git**.
2. Choose this repository: `UglyGameFace/The420lobby.com`.
3. Production branch: `main`. Framework preset: **None**. Build command: **leave blank**. Build output directory: **.** (repository root).
4. Deploy; open the generated `*.pages.dev` preview and test on desktop and mobile before connecting the domain.
5. In Cloudflare Pages, add `the420lobby.com` via **Custom domains**, after verifying all email DNS records.

**DNS precautions:** Northwest remains the domain registrar. Before changing nameservers, verify MX priority 10, SPF TXT, DMARC TXT, complete DKIM TXT for `postal-dytsdb._domainkey`, and the `psrp` CNAME all exist in Cloudflare, with non-proxied mail records. The old Northwest website A records still target Northwest until the cutover. Do not delete unrelated DNS records or change nameservers while the new site remains untested.

## Validation

Run `node --test tests/site.test.mjs` (Node 20+). A matching GitHub Actions workflow validates pushes and pull requests. Manual testing is still needed on Android and desktop for hero artwork readability, performance, reduced-motion, navigation, and external links.

## Before public launch

- Verify the Discord invite opens the intended server during real browser testing.
- Insert verified Minecraft server hostname and current ports only after they are supplied.
- Test Cloudflare preview, mobile performance, links, browser accessibility, and existing DNS/mail continuity.
