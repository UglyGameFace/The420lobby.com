export const HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#111116" />
    <meta
      name="description"
      content="One home for your Discord server's directory reminders, bump confirmations and votes."
    />
    <title>MultiBump — Your server, seen.</title>
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23bbf765'/%3E%3Cpath d='M15 44V20l17 15 17-15v24' fill='none' stroke='%23111116' stroke-width='7'/%3E%3C/svg%3E"
    />
    <link rel="stylesheet" href="/style.css" />
    <script src="/client.js" defer></script>
  </head>
  <body>
    <div class="wash" aria-hidden="true"></div>
    <header class="nav">
      <a class="brand" href="/" aria-label="MultiBump home"
        ><span class="mark">M↗</span>MultiBump<span class="beta">PUBLIC</span></a
      >
      <nav aria-label="Main navigation">
        <a href="#how">How it works</a
        ><a id="login-top" class="small-button" href="/auth/discord">Sign in with Discord ↗</a
        ><button id="logout" class="quiet" hidden>Sign out</button>
      </nav>
    </header>
    <main>
      <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
      <section id="landing" class="hero">
        <p class="eyebrow">
          <span class="dot"></span> A little coordination. A lot more visibility.
        </p>
        <h1>Your server.<br /><span>Keep it seen.</span></h1>
        <p class="lede">
          Bring your directory reminders, bump activity and server votes into one place. Built for
          communities. Managed from anywhere.
        </p>
        <div class="actions">
          <a id="hero-login" class="primary" href="/auth/discord"
            >Set up your server <span>↗</span></a
          ><a class="secondary" href="#how">Take a look ↓</a>
        </div>
        <p id="launch-status" class="muted">Checking service availability…</p>
        <div class="strip">
          <span>DISBOARD</span><span>OneBump</span><span>Discodus</span><span>Discadia</span
          ><span>Discordify</span><span>D-INVITES</span>
        </div>
        <div class="features" id="how">
          <article>
            <span class="number">01 / CONNECT</span>
            <h2>A home for every server.</h2>
            <p>
              Invite MultiBump, choose your bump channel, and enable the directories you use. Each
              server keeps its own settings and history.
            </p>
          </article>
          <article>
            <span class="number">02 / COORDINATE</span>
            <h2>Catch the next window.</h2>
            <p>
              Get a reminder when a directory is due. A member runs the directory’s bump command,
              and public confirmations update the schedule.
            </p>
          </article>
          <article>
            <span class="number">03 / KNOW</span>
            <h2>Activity you can trust.</h2>
            <p>
              See provider confirmations and administrator reports clearly. Signed TheDiscordList
              receipts track real votes.
            </p>
          </article>
        </div>
        <div class="callout">
          <span>GOOD TO KNOW</span>
          <p>
            MultiBump coordinates reminders and records supported confirmations. Members perform
            bumps and votes. Directory bots and listings are installed separately.
          </p>
        </div>
      </section>
      <section id="dashboard" hidden>
        <div class="desk-heading">
          <div>
            <p class="eyebrow">YOUR COMMUNITY DESK</p>
            <h1>Make some noise<span>.</span></h1>
          </div>
          <button class="quiet" id="refresh">Refresh ↻</button>
        </div>
        <div class="server-picker">
          <label for="server">Your server</label
          ><select id="server">
            <option value="">Choose a server…</option></select
          ><a id="install" class="small-button" href="/install">Add MultiBump ↗</a>
        </div>
        <p class="muted">
          Only servers where you currently have Manage Server or Administrator permission appear
          here.
        </p>
        <div id="workspace" hidden>
          <div class="section-head">
            <h2 id="server-name">Server settings</h2>
            <span id="monitor" class="pill">Waiting for setup</span>
          </div>
          <form id="settings" class="panel settings">
            <div>
              <label for="channel">Bump & reminder channel</label
              ><select id="channel" required>
                <option value="">Choose a channel…</option>
              </select>
            </div>
            <div>
              <label for="role">Notification role</label
              ><select id="role">
                <option value="">No role mention</option>
              </select>
            </div>
            <button class="primary" type="submit">Save settings</button>
            <p id="channel-help" class="muted">
              Channels need View Channel, Send Messages, Embed Links and Read Message History.
            </p>
          </form>
          <div class="section-head">
            <div>
              <p class="eyebrow">YOUR DIRECTORIES</p>
              <h2>One place. Every window.</h2>
            </div>
            <button id="pause" class="quiet" disabled>Pause reminders</button>
          </div>
          <p class="muted">
            Choose the cooldown shown by each directory bot. A new service starts with a full
            cooldown estimate.
          </p>
          <div id="services" class="service-grid"></div>
          <div class="section-head">
            <div>
              <p class="eyebrow">MEMBER SUPPORT</p>
              <h2>Every real vote counts.</h2>
            </div>
            <span class="pill">Last 30 days</span>
          </div>
          <div id="votes" class="vote-grid"></div>
          <details id="integration" class="panel">
            <summary>Connect TheDiscordList vote receipts</summary>
            <p>
              Create a JSON webhook for your server listing, subscribe to
              <code>listing.upvoted</code>, and copy its endpoint signing secret here.
            </p>
            <label for="webhook-url">Your webhook endpoint</label
            ><input id="webhook-url" readonly />
            <form id="tdl-form">
              <label for="tdl-secret">Endpoint signing secret</label
              ><input
                id="tdl-secret"
                type="password"
                autocomplete="off"
                minlength="16"
                maxlength="512"
                required
              /><button class="small-button" type="submit">Save connection</button>
            </form>
            <p id="tdl-state" class="muted"></p>
            <a
              href="https://thediscordlist.com/guides/webhooks-for-your-listing"
              target="_blank"
              rel="noopener noreferrer"
              >Provider setup guide ↗</a
            >
          </details>
          <div class="section-head">
            <h2>Activity, without the guesswork.</h2>
            <span id="scheduler" class="muted"></span>
          </div>
          <div id="activity" class="panel activity"></div>
          <details class="panel data-controls">
            <summary>Server data</summary>
            <p>
              Download your configuration and recent activity, or disconnect this server to stop its
              schedules and delete its MultiBump data.
            </p>
            <a id="export" class="small-button">Export data</a
            ><button id="disconnect" class="danger">Disconnect server</button>
          </details>
        </div>
        <p id="empty" class="empty">
          Choose a server above to get started. Add MultiBump if it is not installed yet.
        </p>
      </section>
      <section id="privacy" class="panel">
        <h2>Your community stays yours.</h2>
        <p>
          MultiBump stores server settings and activity records separately for each server. Discord
          sign-in requests your identity and server list. Access tokens are encrypted and expire
          within one hour; sign out removes the session. It never asks for your Discord account
          password or user token.
        </p>
        <p>
          Only known directory-bot messages are inspected for confirmations in the configured
          channel. Raw messages and voter identities are not stored. Activity is kept for 30 days,
          confirmation deduplication records for 90 days. Server administrators can export or delete
          their server’s records above.
        </p>
        <p>
          Use this service for servers you manage and follow the rules of each directory. Service
          availability and third-party integrations can change. No paid plan or ranking outcome is
          promised.
        </p>
      </section>
    </main>
    <footer>
      <a class="brand" href="/">MultiBump<span class="dot"></span></a
      ><span>Built by The 420 Lobby.</span><a href="#privacy">Privacy & terms</a
      ><a href="https://discord.gg/the420lobby" target="_blank" rel="noopener noreferrer"
        >Support ↗</a
      >
    </footer>
    <noscript
      ><p class="notice">
        Enable JavaScript to manage your servers. Discord setup commands also work after the bot is
        connected.
      </p></noscript
    >
  </body>
</html>
`;

export const CSS = String.raw`@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap");
:root {
  color-scheme: dark;
  --bg: #111116;
  --panel: #1b1b23;
  --line: #33333f;
  --text: #f5f3fa;
  --muted: #b1aebd;
  --lime: #bbf765;
  --purple: #b7a2ed;
}
* {
  box-sizing: border-box;
}
html {
  scroll-behavior: smooth;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font:
    16px "DM Sans",
    system-ui,
    sans-serif;
  line-height: 1.6;
}
button,
input,
select {
  font: inherit;
}
a {
  color: inherit;
}
button,
a,
input,
select,
summary {
  touch-action: manipulation;
}
button,
a {
  -webkit-tap-highlight-color: transparent;
}
button {
  cursor: pointer;
}
button:disabled,
a[aria-disabled="true"] {
  opacity: 0.5;
  cursor: default;
}
a[aria-disabled="true"] {
  pointer-events: none;
}
a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--lime);
  outline-offset: 4px;
}
button,
a {
  transition:
    background 0.16s,
    transform 0.16s;
}
.wash {
  pointer-events: none;
  position: absolute;
  z-index: -1;
  inset: 0 0 auto;
  height: 750px;
  background: radial-gradient(ellipse at 95% 25%, #40305855, transparent 60%);
}
.nav,
main,
footer {
  max-width: 1200px;
  margin: auto;
  padding: 0 44px;
}
.nav {
  height: 112px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.brand {
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: "Space Grotesk", system-ui;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -1px;
}
.mark {
  display: grid;
  place-items: center;
  background: var(--lime);
  color: var(--bg);
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 21px;
  letter-spacing: -4px;
  padding-right: 5px;
}
.beta {
  font:
    600 9px "DM Sans",
    sans-serif;
  letter-spacing: 1.8px;
  color: var(--muted);
  border: 1px solid var(--line);
  padding: 4px 7px;
  border-radius: 5px;
}
.nav nav {
  display: flex;
  gap: 28px;
  align-items: center;
}
.nav nav > a:first-child {
  font-size: 14px;
  text-decoration: none;
}
.small-button,
.quiet,
.secondary,
.danger,
.primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 46px;
  padding: 10px 18px;
  text-decoration: none;
  font-weight: 600;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  font-size: 14px;
}
.primary {
  background: var(--lime);
  border-color: var(--lime);
  color: #18200d;
  padding: 16px 24px;
  min-height: 56px;
}
.primary:hover {
  background: #d0ff8d;
}
.secondary,
.quiet {
  background: transparent;
}
.quiet:hover,
.small-button:hover {
  background: #2b2a35;
}
.danger {
  color: #ffb6bf;
  border-color: #6b3b48;
  background: transparent;
}
.hero {
  padding-top: 64px;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 2px;
  font-weight: 600;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 10px;
}
.dot {
  height: 7px;
  width: 7px;
  background: var(--lime);
  border-radius: 50%;
  display: inline-block;
}
h1,
h2,
h3 {
  font-family: "Space Grotesk", system-ui;
  line-height: 1.05;
  letter-spacing: -2px;
}
h1 {
  font-size: clamp(52px, 7vw, 92px);
  margin: 28px 0;
}
h1 span {
  color: var(--purple);
}
.hero h1 span {
  color: var(--lime);
}
.lede {
  font-size: 18px;
  color: var(--muted);
  max-width: 520px;
  line-height: 1.7;
}
.actions {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 28px 0 18px;
}
.muted {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.7;
}
.strip {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  justify-content: space-between;
  padding: 30px 0;
  margin-top: 68px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  font-family: "Space Grotesk";
  font-weight: 600;
  font-size: 16px;
  color: #c8c4d3;
}
.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 36px;
  padding: 64px 0;
}
.number {
  font-size: 10px;
  font-weight: 600;
  color: var(--purple);
  letter-spacing: 1.8px;
}
.features h2 {
  font-size: 25px;
  line-height: 1.2;
  letter-spacing: -0.8px;
}
.features p,
.callout p,
#privacy p,
details p {
  color: var(--muted);
  font-size: 14px;
}
.callout {
  border-left: 3px solid var(--purple);
  padding: 0 0 0 24px;
  margin: 0 0 72px;
  display: flex;
  gap: 32px;
  align-items: center;
}
.callout > span {
  font-size: 10px;
  letter-spacing: 2px;
  white-space: nowrap;
  color: var(--purple);
}
.callout p {
  margin: 0;
  max-width: 700px;
}
.notice {
  border: 1px solid #695980;
  background: #2a2435;
  border-radius: 10px;
  padding: 16px 20px;
  margin-top: 14px;
}
.notice.error {
  border-color: #9d4e62;
  background: #3e2530;
}
.desk-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 36px;
}
.desk-heading h1 {
  font-size: 48px;
  letter-spacing: -2px;
  margin-top: 15px;
}
.server-picker {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 22px 0;
}
.server-picker label {
  font-weight: 600;
}
.server-picker select {
  flex: 1;
  min-width: 180px;
}
.server-picker .small-button {
  min-height: 49px;
}
label {
  display: block;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 7px;
}
select,
input {
  width: 100%;
  color: var(--text);
  background: #14141b;
  border: 1px solid #474351;
  padding: 12px;
  border-radius: 8px;
  min-height: 48px;
  min-width: 0;
}
select {
  cursor: pointer;
}
.panel {
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--panel);
  padding: 24px;
}
.settings {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 18px;
  align-items: end;
}
.settings .muted {
  grid-column: 1/-1;
  margin: 0;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 44px 0 20px;
}
.section-head h2 {
  font-size: 29px;
  letter-spacing: -1px;
  margin: 10px 0;
}
.pill {
  border: 1px solid #4c435d;
  color: #d8c9f5;
  font-size: 11px;
  padding: 6px 12px;
  border-radius: 100px;
  white-space: normal;
  text-align: center;
}
.service-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.service {
  padding: 23px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.service h3 {
  font-size: 22px;
  letter-spacing: -0.7px;
  margin: 0;
}
.service .state {
  font-size: 13px;
  color: var(--lime);
  min-height: 25px;
}
.service .muted {
  margin: 0;
  min-height: 42px;
}
.service summary {
  font-size: 13px;
  color: var(--purple);
  padding: 10px 0;
}
.service form {
  display: grid;
  gap: 12px;
  margin: 10px 0;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
}
.check input {
  width: 20px;
  min-height: 20px;
  height: 20px;
  accent-color: var(--lime);
}
.service .quiet {
  width: 100%;
  margin-top: auto;
}
.service > a {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.vote-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.vote-grid h3 {
  font-size: 17px;
  letter-spacing: -0.4px;
  margin: 0;
}
.vote-grid strong {
  display: block;
  font: 500 32px "Space Grotesk";
  margin: 12px 0;
}
.vote-grid p {
  color: var(--muted);
  font-size: 12px;
}
.vote-grid a {
  font-size: 12px;
  color: var(--purple);
}
#integration {
  margin-top: 20px;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
details > form {
  margin-top: 18px;
}
details input {
  margin-bottom: 12px;
}
.activity {
  padding: 8px 24px;
}
.event {
  border-bottom: 1px solid var(--line);
  padding: 18px 0;
  display: flex;
  gap: 18px;
  justify-content: space-between;
}
.event:last-child {
  border: 0;
}
.event strong {
  font-size: 13px;
}
.event p {
  font-size: 12px;
  color: var(--muted);
  margin: 4px 0;
}
.event time {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.empty {
  padding: 48px 0;
  color: var(--muted);
}
.data-controls {
  margin: 24px 0 56px;
}
.data-controls button {
  margin: 8px;
}
#privacy {
  margin: 20px 0 54px;
  background: transparent;
}
#privacy h2 {
  font-size: 24px;
  letter-spacing: -0.7px;
}
footer {
  display: flex;
  align-items: center;
  gap: 24px;
  border-top: 1px solid var(--line);
  padding-top: 26px;
  padding-bottom: 35px;
  color: var(--muted);
  font-size: 12px;
}
footer .brand {
  font-size: 18px;
  color: var(--text);
  margin-right: auto;
}
footer > a:not(.brand) {
  text-decoration: none;
}
[hidden] {
  display: none !important;
}
code {
  overflow-wrap: anywhere;
  color: var(--purple);
}
@media (max-width: 900px) {
  .service-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .vote-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .settings {
    grid-template-columns: 1fr 1fr;
  }
  .settings button {
    grid-column: 1/-1;
  }
  .features {
    gap: 24px;
  }
  footer {
    flex-wrap: wrap;
  }
}
@media (max-width: 600px) {
  .nav,
  main,
  footer {
    padding-left: 22px;
    padding-right: 22px;
  }
  .nav {
    height: 90px;
    gap: 12px;
  }
  .nav nav > a:first-child {
    display: none;
  }
  .brand {
    font-size: 21px;
    gap: 8px;
  }
  .beta {
    display: none;
  }
  .mark {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    font-size: 17px;
  }
  .nav .small-button {
    font-size: 11px;
    padding: 8px 10px;
    min-height: 42px;
  }
  .hero {
    padding-top: 35px;
  }
  h1 {
    font-size: 62px;
    letter-spacing: -3px;
  }
  .hero .eyebrow {
    font-size: 9px;
    letter-spacing: 1.2px;
  }
  .lede {
    font-size: 16px;
  }
  .strip {
    justify-content: flex-start;
    gap: 15px 23px;
    margin-top: 42px;
    font-size: 14px;
  }
  .features {
    grid-template-columns: 1fr;
    padding: 42px 0;
    gap: 28px;
  }
  .features h2 {
    margin: 14px 0;
  }
  .callout {
    display: block;
    padding-left: 18px;
  }
  .callout p {
    margin-top: 12px;
  }
  .desk-heading h1 {
    font-size: 35px;
  }
  .desk-heading .quiet {
    padding: 8px;
  }
  .settings {
    grid-template-columns: 1fr;
    padding: 20px;
  }
  .service-grid {
    grid-template-columns: 1fr;
  }
  .section-head {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .section-head h2 {
    font-size: 25px;
  }
  .vote-grid {
    gap: 10px;
  }
  .vote-grid .panel {
    padding: 17px;
  }
  .event {
    flex-direction: column;
    gap: 4px;
  }
  .event time {
    white-space: normal;
  }
  footer {
    gap: 14px;
  }
  footer .brand {
    width: 100%;
  }
  .server-picker {
    gap: 10px;
  }
  .server-picker label {
    width: 100%;
  }
  #scheduler {
    font-size: 11px;
  }
  .actions .primary {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  button,
  a {
    transition: none;
  }
}
`;

export const JS = String.raw`"use strict";
const $ = (id) => document.getElementById(id);
let me = null,
  guildId = "",
  state = null,
  sequence = 0,
  busy = false;
const labels = {
  provider_confirmed: "Provider confirmed bump",
  member_reported: "Administrator reported bump",
  service_saved: "Directory settings saved",
  settings_saved: "Server settings saved",
  reminder_sent: "Reminder delivered",
  reminder_failed: "Reminder delivery failed or uncertain",
  vote_confirmed: "Provider confirmed vote",
  vote_webhook_connected: "Vote connection saved",
  reminders_paused: "Reminders paused",
  reminders_resumed: "Reminders resumed",
};
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").hidden = !text;
  $("notice").classList.toggle("error", error);
}
function node(tag, text, className) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function link(text, url) {
  const a = node("a", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
async function api(path, body) {
  const r = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": me?.csrf || "" },
          body: JSON.stringify(body),
        }),
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401) {
      $("login-top").hidden = false;
      notice("Your Discord session expired. Sign in again.", true);
    }
    throw new Error(data.error?.message || "Could not complete this request.");
  }
  return data;
}
async function action(fn) {
  if (busy) return;
  busy = true;
  $("server").disabled = true;
  try {
    await fn();
  } catch (e) {
    notice(e.message, true);
  } finally {
    busy = false;
    $("server").disabled = false;
  }
}
function option(select, value, text) {
  const o = node("option", text);
  o.value = value;
  select.append(o);
}
function when(at) {
  return at ? new Date(at).toLocaleString() : "No confirmation yet";
}
function due(s) {
  if (!s.enabled) return "Paused";
  const seconds = Math.ceil((s.next_due_at - Date.now()) / 1000);
  return seconds <= 0
    ? "Ready for a member bump"
    : seconds < 3600
      ? "Due in " + Math.ceil(seconds / 60) + " min"
      : "Due in " + Math.ceil(seconds / 3600) + " hr";
}
function render() {
  const g = state.guild,
    configured = Boolean(g);
  $("server-name").textContent =
    g?.name || $("server").selectedOptions[0]?.textContent || "Server settings";
  const monitorNames = {
    checked: "Confirmation check completed",
    no_visible_messages: "No readable messages found",
    waiting: "Waiting for confirmation check",
    message_content_unavailable: "Message content access needed",
    catching_up: "Catching up on channel history",
  };
  $("monitor").textContent = !g
    ? "Choose a channel to begin"
    : (monitorNames[g.monitor_status] || "Confirmation check needs attention") +
      (g.monitor_checked_at ? " · " + when(g.monitor_checked_at) : "");
  $("channel").value = g?.channel_id || "";
  $("role").value = g?.role_id || "";
  $("pause").disabled = !configured;
  $("pause").textContent = g?.paused ? "Resume reminders" : "Pause reminders";
  $("services").replaceChildren();
  for (const p of state.providers) {
    const s = state.services.find((x) => x.provider === p.id),
      card = node("article", null, "panel service");
    card.append(node("h3", p.label), node("div", s ? due(s) : "Not enabled", "state"));
    const anchor = s?.last_confirmed_at
      ? "Provider confirmed " + when(s.last_confirmed_at)
      : s?.last_reported_at
        ? "Administrator report " + when(s.last_reported_at)
        : "No confirmed bumps yet";
    card.append(node("p", anchor, "muted"), link("Directory & setup ↗", p.helpUrl));
    if (s?.reminder_status && s.reminder_status !== "none" && s.reminder_status !== "sent")
      card.append(
        node(
          "p",
          "Last reminder: " +
            s.reminder_status.replaceAll("_", " ") +
            ". Check channel permissions before the next due window.",
          "muted",
        ),
      );
    const details = node("details"),
      summary = node("summary", "Directory settings"),
      form = node("form");
    details.append(summary, form);
    const enabled = node("label", null, "check"),
      check = node("input");
    check.type = "checkbox";
    check.checked = Boolean(s?.enabled);
    check.id = "enabled-" + p.id;
    enabled.append(check, document.createTextNode("Enable reminders"));
    const cooldown = node("label", "Cooldown in minutes"),
      minutes = node("input");
    minutes.type = "number";
    minutes.min = "15";
    minutes.max = "10080";
    minutes.step = "1";
    minutes.required = true;
    minutes.id = "minutes-" + p.id;
    minutes.value = s?.cooldown_minutes ?? (p.intervalVerified ? p.cooldownMinutes : "") ?? "";
    cooldown.htmlFor = minutes.id;
    const save = node("button", "Save directory", "small-button");
    save.type = "submit";
    save.disabled = !configured;
    form.append(enabled, cooldown, minutes);
    if (!p.intervalVerified)
      form.append(node("p", "Enter the cooldown shown by this directory bot.", "muted"));
    form.append(save);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      action(async () => {
        await api("/api/guilds/" + guildId + "/services/" + p.id, {
          enabled: check.checked,
          cooldownMinutes: Number(minutes.value),
        });
        await loadGuild();
        notice(p.label + " settings saved.");
      });
    });
    const done = node("button", "I completed a bump", "quiet");
    done.type = "button";
    done.disabled = !s?.enabled;
    done.addEventListener("click", () =>
      action(async () => {
        await api("/api/guilds/" + guildId + "/services/" + p.id + "/report", {});
        await loadGuild();
        notice("Bump saved as an administrator report.");
      }),
    );
    card.append(details, done);
    $("services").append(card);
  }
  $("votes").replaceChildren();
  for (const p of state.voting) {
    const receipt = state.votes.find((v) => v.provider === p.id),
      card = node("article", null, "panel");
    card.append(
      node("h3", p.label),
      node(
        "strong",
        p.receipt === "signed_webhook"
          ? state.tdlConnected
            ? String(receipt?.count || 0)
            : "Connect"
          : "↗",
      ),
      node("p", p.hint),
    );
    card.append(
      link(p.listingUrl ? "Open server listing ↗" : "Open directory ↗", p.listingUrl || p.url),
    );
    const details = node("details"),
      summary = node("summary", "Set your listing"),
      form = node("form"),
      label = node("label", "Server listing URL"),
      input = node("input"),
      save = node("button", "Save link", "small-button");
    input.type = "url";
    input.required = true;
    input.id = "vote-link-" + p.id;
    input.value = p.listingUrl || "";
    label.htmlFor = input.id;
    save.type = "submit";
    save.disabled = !configured;
    form.append(label, input, save);
    details.append(summary, form);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      action(async () => {
        await api("/api/guilds/" + guildId + "/votes/" + p.id, { url: input.value });
        await loadGuild();
        notice("Server listing link saved.");
      });
    });
    card.append(details);
    $("votes").append(card);
  }
  $("webhook-url").value = location.origin + "/api/webhooks/tdl/" + guildId;
  $("tdl-state").textContent = state.tdlConnected
    ? "Signing secret saved. Only accepted provider receipts count as votes."
    : "No signing secret connected yet.";
  $("activity").replaceChildren();
  for (const e of state.events) {
    const row = node("div", null, "event"),
      content = node("div");
    content.append(
      node(
        "strong",
        (e.provider
          ? (state.providers.find((p) => p.id === e.provider)?.label || e.provider) + " · "
          : "") + (labels[e.event] || e.event.replaceAll("_", " ")),
      ),
      node("p", e.detail),
    );
    const time = node("time", when(e.at));
    time.dateTime = new Date(e.at).toISOString();
    row.append(content, time);
    $("activity").append(row);
  }
  if (!state.events.length)
    $("activity").append(node("p", "Your server’s activity will appear here.", "muted"));
  $("scheduler").textContent = state.schedulerLastTick
    ? "Scheduler checked " + when(state.schedulerLastTick)
    : "Scheduler has not checked in yet";
  $("export").href = "/api/guilds/" + guildId + "/export";
  $("export").setAttribute("download", "multibump-" + guildId + ".json");
  $("disconnect").disabled = !configured;
}
async function loadGuild() {
  const requested = guildId,
    load = ++sequence;
  $("workspace").hidden = true;
  $("empty").hidden = false;
  $("empty").textContent = "Loading your server…";
  try {
    const [data, available] = await Promise.all([
      api("/api/guilds/" + requested),
      api("/api/guilds/" + requested + "/channels"),
    ]);
    if (load !== sequence || requested !== guildId) return;
    state = data;
    $("channel").replaceChildren();
    option($("channel"), "", "Choose a channel…");
    for (const c of available.channels) option($("channel"), c.id, "#" + c.name);
    $("role").replaceChildren();
    option($("role"), "", "No role mention");
    for (const r of available.roles) option($("role"), r.id, r.name);
    render();
    $("workspace").hidden = false;
    $("empty").hidden = true;
  } catch (e) {
    if (load !== sequence) return;
    $("empty").textContent = "Add MultiBump to this server, then refresh. " + e.message;
    throw e;
  }
}
async function boot() {
  try {
    me = await api("/api/session");
    if (!me.ready) {
      $("launch-status").textContent =
        "Public launch is being prepared. Discord app connection is pending.";
      for (const id of ["hero-login", "login-top"]) {
        $(id).setAttribute("aria-disabled", "true");
        $(id).removeAttribute("href");
      }
      return;
    }
    $("launch-status").textContent = "No Termux. No installs for your members. Just Discord.";
    if (!me.user) {
      if (new URLSearchParams(location.search).has("auth"))
        notice("Discord sign-in did not finish. Try signing in again.", true);
      return;
    }
    $("landing").hidden = true;
    $("dashboard").hidden = false;
    $("login-top").hidden = true;
    $("logout").hidden = false;
    for (const g of me.guilds) option($("server"), g.id, g.name);
    const target = new URLSearchParams(location.hash.slice(1)).get("server");
    if (me.guilds.some((g) => g.id === target)) {
      $("server").value = target;
      await selectServer();
    }
    if (!me.guilds.length)
      $("empty").textContent =
        "No managed servers found. Sign in with a Discord account that has Manage Server permission.";
  } catch (e) {
    notice(e.message, true);
    $("launch-status").textContent = "Service status unavailable. Try refreshing shortly.";
  }
}
async function selectServer() {
  guildId = $("server").value;
  sequence++;
  notice("");
  $("workspace").hidden = true;
  $("empty").hidden = false;
  if (!guildId) {
    $("empty").textContent = "Choose a server to get started.";
    return;
  }
  history.replaceState(null, "", "#server=" + guildId);
  $("install").href = "/install?guild=" + guildId;
  await loadGuild();
}
$("server").addEventListener("change", () => action(selectServer));
$("refresh").addEventListener("click", () =>
  action(() => (guildId ? loadGuild() : Promise.resolve())),
);
$("settings").addEventListener("submit", (e) => {
  e.preventDefault();
  action(async () => {
    await api("/api/guilds/" + guildId + "/setup", {
      channelId: $("channel").value,
      roleId: $("role").value || null,
    });
    await loadGuild();
    notice("Server settings saved. Enable your directories below.");
  });
});
$("pause").addEventListener("click", () =>
  action(async () => {
    await api("/api/guilds/" + guildId + "/pause", { paused: !state.guild.paused });
    await loadGuild();
  }),
);
$("tdl-form").addEventListener("submit", (e) => {
  e.preventDefault();
  action(async () => {
    await api("/api/guilds/" + guildId + "/tdl", { secret: $("tdl-secret").value });
    $("tdl-secret").value = "";
    await loadGuild();
    notice("Vote receipt connection saved. Send a test webhook from TheDiscordList to verify it.");
  });
});
$("logout").addEventListener("click", () =>
  action(async () => {
    await api("/api/logout", {});
    location.assign("/");
  }),
);
$("disconnect").addEventListener("click", () =>
  action(async () => {
    if (!confirm("Disconnect this server and delete its MultiBump settings, secrets and activity?"))
      return;
    await api("/api/guilds/" + guildId + "/disconnect", { confirm: guildId });
    await loadGuild();
    notice("Server disconnected and its data deleted.");
  }),
);
boot();
`;
