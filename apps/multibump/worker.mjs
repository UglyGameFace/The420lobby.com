import {
  Fault,
  ID,
  json,
  redirect,
  origin,
  configuration,
  readJson,
  fields,
  csrf,
  limit,
} from "./core.mjs";
import { begin, callback, requireSession, currentGuilds, requireGuild, logout } from "./auth.mjs";
import { channels, setup, service, report, snapshot, pause, disconnect } from "./service.mjs";
import { interactions } from "./commands.mjs";
import { webhook, connect, voteLink } from "./votes.mjs";
import { tick } from "./scheduler.mjs";
import { HTML, CSS, JS } from "./ui.mjs";
function secure(response) {
  const h = new Headers(response.headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.set("Strict-Transport-Security", "max-age=31536000");
  h.set(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  return new Response(response.body, { status: response.status, headers: h });
}
function method(request, expected) {
  if (request.method !== expected) throw new Fault(405, "method", "Method not allowed.");
}
export async function handle(request, env, ctx = { waitUntil: () => {} }, sender = fetch) {
  try {
    const url = new URL(request.url),
      path = url.pathname;
    if (url.origin !== origin(env)) throw new Fault(404, "host", "Not found.");
    if (path === "/api/discord/interactions") {
      method(request, "POST");
      return secure(await interactions(request, env, ctx, sender));
    }
    const hook = /^\/api\/webhooks\/tdl\/(\d{17,20})$/.exec(path);
    if (hook) {
      method(request, "POST");
      return secure(await webhook(request, env, hook[1]));
    }
    if (path === "/health") {
      method(request, "GET");
      const missing = configuration(env);
      let database = false;
      try {
        database = Boolean(
          await env.DB?.prepare("SELECT name FROM sqlite_master WHERE name='mb_guilds'").first(),
        );
      } catch {}
      return secure(
        json({
          status: missing.length || !database ? "setup_pending" : "ready",
          database,
          discordConnected: !missing.some((m) => m.startsWith("Discord")),
          version: env.RELEASE_SHA || "development",
        }),
      );
    }
    if (path === "/") {
      method(request, "GET");
      return secure(
        new Response(HTML, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        }),
      );
    }
    if (path === "/style.css" || path === "/client.js") {
      method(request, "GET");
      return secure(
        new Response(path === "/style.css" ? CSS : JS, {
          headers: {
            "Content-Type":
              path === "/style.css"
                ? "text/css; charset=utf-8"
                : "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        }),
      );
    }
    if (path === "/robots.txt") {
      method(request, "GET");
      return secure(new Response("User-agent: *\nDisallow: /api/\nDisallow: /auth/\n"));
    }
    if (path === "/auth/discord") {
      method(request, "GET");
      return secure(await begin(request, env));
    }
    if (path === "/auth/callback") {
      method(request, "GET");
      return secure(await callback(request, env, sender));
    }
    if (path === "/install") {
      method(request, "GET");
      if (configuration(env).length)
        throw new Fault(503, "setup_pending", "MultiBump’s Discord app connection is pending.");
      const target = new URL("https://discord.com/oauth2/authorize");
      target.search = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        scope: "bot applications.commands",
        permissions: "84992",
        integration_type: "0",
      }).toString();
      const guild = url.searchParams.get("guild");
      if (ID.test(guild || "")) {
        target.searchParams.set("guild_id", guild);
        target.searchParams.set("disable_guild_select", "true");
      }
      return secure(redirect(target.href));
    }
    if (path === "/api/session" && request.method === "GET" && configuration(env).length)
      return secure(json({ ready: false, user: null, guilds: [] }));
    if (!path.startsWith("/api/")) throw new Fault(404, "not_found", "Not found.");
    const s = await requireSession(request, env);
    await limit(env, "api:" + s.user_id, request.method === "GET" ? 120 : 40, 60);
    if (request.method !== "GET") csrf(request, s, env);
    if (path === "/api/session") {
      method(request, "GET");
      const servers = await currentGuilds(env, s, sender);
      return secure(
        json({
          ready: true,
          user: { id: s.user_id, username: s.username },
          csrf: s.csrf,
          guilds: servers.map((g) => ({ id: g.id, name: g.name })),
        }),
      );
    }
    if (path === "/api/logout") {
      method(request, "POST");
      fields(await readJson(request), []);
      return secure(await logout(env, s));
    }
    const match = /^\/api\/guilds\/(\d{17,20})(?:\/(.*))?$/.exec(path);
    if (!match) throw new Fault(404, "not_found", "Not found.");
    const guildId = match[1],
      action = match[2] || "";
    await requireGuild(env, s, guildId, sender);
    if (action === "" || action === "export") {
      method(request, "GET");
      const data = await snapshot(env, guildId);
      return secure(
        json(
          data,
          200,
          action === "export"
            ? {
                "Content-Disposition": 'attachment; filename="multibump-' + guildId + '.json"',
              }
            : {},
        ),
      );
    }
    if (action === "channels") {
      method(request, "GET");
      const data = await channels(env, guildId, s.user_id, sender);
      return secure(json({ channels: data.channels, roles: data.roles }));
    }
    method(request, "POST");
    const body = await readJson(request);
    let result;
    if (action === "setup") result = await setup(env, guildId, s.user_id, body, sender);
    else if (action === "pause") {
      fields(body, ["paused"]);
      result = await pause(env, guildId, body.paused);
    } else if (action === "disconnect") {
      fields(body, ["confirm"]);
      if (body.confirm !== guildId) throw new Fault(400, "confirmation", "Confirm this server ID.");
      result = await disconnect(env, guildId);
    } else if (action === "tdl") result = await connect(env, guildId, body);
    else if (action.startsWith("votes/"))
      result = await voteLink(env, guildId, action.slice(6), body);
    else {
      const p = /^services\/([a-z-]+)(\/report)?$/.exec(action);
      if (!p) throw new Fault(404, "not_found", "Unknown action.");
      if (p[2]) {
        fields(body, []);
        result = await report(env, guildId, p[1]);
      } else result = await service(env, guildId, p[1], body);
    }
    return secure(json(result));
  } catch (error) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status === 500) console.error("MultiBump request failed");
    return secure(
      json(
        {
          error: {
            code: error.code || "internal",
            message:
              status === 500
                ? "Could not complete this request. Try again shortly."
                : error.message,
          },
        },
        status,
      ),
    );
  }
}
export default {
  fetch: handle,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env).then((result) => console.info("MultiBump scheduler", result)));
  },
};
