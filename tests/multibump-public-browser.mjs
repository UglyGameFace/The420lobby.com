import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { HTML, CSS, JS } from "../apps/multibump/ui.mjs";
import { PROVIDERS, VOTING } from "../apps/multibump/catalog.mjs";
const require = createRequire(new URL("../apps/multibump/package.json", import.meta.url));
const { chromium } = require("playwright");
const A = "1514374173517152418",
  B = "1514374173517152419",
  CA = "1564259023266512948",
  CB = "1564259023266512949";
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://local").pathname;
  res.setHeader(
    "Content-Type",
    path === "/style.css" ? "text/css" : path === "/client.js" ? "text/javascript" : "text/html",
  );
  res.end(path === "/style.css" ? CSS : path === "/client.js" ? JS : HTML);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) {
  try {
    const runtime = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright");
    const candidate = runtime.chromium.executablePath();
    if (existsSync(candidate)) executablePath = candidate;
  } catch {}
}
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const artifacts = new URL("../artifacts/", import.meta.url);
mkdirSync(artifacts, { recursive: true });
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, deviceScaleFactor: 1 });
    let ready = true,
      signedIn = true,
      denied = false;
    const errors = [],
      writes = [],
      configs = new Map(),
      services = new Map(),
      links = new Map();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        path = u.pathname,
        body = req.method() === "POST" ? req.postDataJSON() : null;
      const reply = (data, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (path === "/api/session")
        return reply({
          ready,
          user: signedIn ? { id: "123456789012345678", username: "owner" } : null,
          csrf: "test-csrf",
          guilds: signedIn
            ? [
                { id: A, name: "Server A <script>" },
                { id: B, name: "Server B" },
              ]
            : [],
        });
      if (path === "/api/logout") {
        signedIn = false;
        return reply({ ok: true });
      }
      const m = /^\/api\/guilds\/(\d+)(?:\/(.*))?$/.exec(path);
      if (!m) return reply({ error: { message: "Unknown endpoint" } }, 404);
      if (denied) return reply({ error: { message: "You need Manage Server permission." } }, 403);
      const id = m[1],
        action = m[2] || "";
      if (action === "channels")
        return reply({ channels: [{ id: id === A ? CA : CB, name: "bump" }], roles: [] });
      if (!action)
        return reply({
          guild: configs.get(id) || null,
          services: [...(services.get(id) || new Map()).values()],
          events: [],
          votes: [],
          tdlConnected: links.get(id + ":tdl-connected") === true,
          schedulerLastTick: Date.now(),
          serverTime: Date.now(),
          providers: Object.values(PROVIDERS).map(({ success, cooldown, ...p }) => p),
          voting: VOTING.map((p) => ({ ...p, listingUrl: links.get(id + ":" + p.id) || null })),
        });
      assert.equal(req.headers()["x-csrf-token"], "test-csrf");
      writes.push({ id, action, body });
      if (action === "setup")
        configs.set(id, {
          guild_id: id,
          name: id === A ? "Server A <script>" : "Server B",
          channel_id: body.channelId,
          role_id: null,
          paused: 0,
          monitor_status: "waiting",
        });
      if (action === "pause") configs.get(id).paused = body.paused ? 1 : 0;
      if (action === "tdl") links.set(id + ":tdl-connected", true);
      if (action.startsWith("votes/")) links.set(id + ":" + action.slice(6), body.url);
      if (action === "disconnect") {
        configs.delete(id);
        services.delete(id);
      }
      const p = /^services\/([a-z-]+)(\/report)?$/.exec(action);
      if (p) {
        if (!services.has(id)) services.set(id, new Map());
        if (p[2]) services.get(id).get(p[1]).last_reported_at = Date.now();
        else
          services
            .get(id)
            .set(p[1], {
              provider: p[1],
              enabled: body.enabled ? 1 : 0,
              cooldown_minutes: body.cooldownMinutes,
              next_due_at: Date.now() + body.cooldownMinutes * 60000,
              reminder_status: "none",
            });
      }
      return reply({ ok: true });
    });
    await page.goto(base + "/#server=" + A);
    await page.locator("#workspace").waitFor({ state: "visible" });
    assert.equal(await page.locator(".service-grid article").count(), 6);
    assert.equal(await page.locator(".vote-grid article").count(), 4);
    assert.ok(await page.getByRole("heading", { name: "Server A <script>" }).isVisible());
    assert.equal(await page.locator("script:not([src])").count(), 0);
    await page.locator("#channel").selectOption(CA);
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await page
      .getByText("Server settings saved. Enable your directories below.", { exact: true })
      .waitFor();
    const disboard = page
      .locator(".service")
      .filter({ has: page.getByRole("heading", { name: "DISBOARD", exact: true }) });
    await disboard.getByText("Directory settings", { exact: true }).click();
    await disboard.getByLabel("Enable reminders").check();
    await disboard.getByRole("button", { name: "Save directory" }).click();
    await page.getByText("DISBOARD settings saved.", { exact: true }).waitFor();
    assert.equal(writes.at(-1).id, A);
    assert.equal(writes.at(-1).body.cooldownMinutes, 120);
    await disboard.getByRole("button", { name: "I completed a bump" }).click();
    await page.getByText("Bump saved as an administrator report.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Pause reminders", exact: true }).click();
    await page.getByRole("button", { name: "Resume reminders", exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      "horizontal overflow at " + width,
    );
    await page.screenshot({
      path: new URL("multibump-public-" + width + ".png", artifacts).pathname,
      fullPage: true,
    });
    await page.locator("#server").selectOption(B);
    await page.getByRole("heading", { name: "Server B", exact: true }).waitFor();
    assert.equal(
      await page
        .locator(".service button")
        .filter({ hasText: "I completed a bump" })
        .first()
        .isEnabled(),
      false,
    );
    await page.locator("#server").selectOption(A);
    await page.getByRole("heading", { name: "Server A <script>" }).waitFor();
    if (width === 390) {
      const vote = page
        .locator(".vote-grid article")
        .filter({ has: page.getByRole("heading", { name: "Discordify", exact: true }) });
      await vote.getByText("Set your listing", { exact: true }).click();
      await vote.getByLabel("Server listing URL").fill("https://discordify.net/server/test-server");
      await vote.getByRole("button", { name: "Save link" }).click();
      await page.getByText("Server listing link saved.", { exact: true }).waitFor();
      assert.equal(
        await vote.getByRole("link", { name: "Open server listing ↗" }).getAttribute("href"),
        "https://discordify.net/server/test-server",
      );
      await page.getByText("Connect TheDiscordList vote receipts", { exact: true }).click();
      await page
        .getByLabel("Endpoint signing secret", { exact: true })
        .fill("browser-test-secret-not-production");
      await page.getByRole("button", { name: "Save connection" }).click();
      await page
        .getByText(
          "Vote receipt connection saved. Send a test webhook from TheDiscordList to verify it.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await page.locator("#tdl-secret").inputValue(), "");
      denied = true;
      await page.getByRole("button", { name: "Refresh ↻", exact: true }).click();
      await page.getByText("You need Manage Server permission.", { exact: true }).waitFor();
      denied = false;
      await page.reload();
      await page.locator("#workspace").waitFor({ state: "visible" });
      page.once("dialog", (d) => d.accept());
      await page.getByText("Server data", { exact: true }).click();
      await page.getByRole("button", { name: "Disconnect server", exact: true }).click();
      await page.getByText("Server disconnected and its data deleted.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.locator("#landing").waitFor({ state: "visible" });
      ready = false;
      await page.reload();
      await page
        .getByText("Public launch is being prepared. Discord app connection is pending.", {
          exact: true,
        })
        .waitFor();
      assert.equal(await page.locator("#hero-login").getAttribute("href"), null);
    }
    assert.deepEqual(errors, [], "browser errors at " + width);
    await page.close();
    console.info(
      "PASS public dashboard at " +
        width +
        "px: setup, directories, reports, pause and server isolation",
    );
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
