import { choices, PROVIDERS } from "./catalog.mjs";
import { Fault, ID, manages, origin, json, signature, ready } from "./core.mjs";
import { setup, service, report, snapshot, pause } from "./service.mjs";
export const COMMAND = {
  name: "multibump",
  description: "Manage this server’s directory reminders and verified activity",
  type: 1,
  default_member_permissions: "32",
  integration_types: [0],
  contexts: [0],
  options: [
    {
      type: 1,
      name: "setup",
      description: "Choose the channel for reminders and public bump confirmations",
      options: [
        {
          type: 7,
          name: "channel",
          description: "Your bump channel (default: this channel)",
          channel_types: [0, 5],
        },
      ],
    },
    {
      type: 1,
      name: "service",
      description: "Enable or pause a directory service",
      options: [
        { type: 3, name: "provider", description: "Directory", required: true, choices },
        { type: 5, name: "enabled", description: "Enable reminders", required: true },
        {
          type: 4,
          name: "minutes",
          description: "Cooldown shown by the directory bot",
          min_value: 15,
          max_value: 10080,
        },
      ],
    },
    {
      type: 1,
      name: "done",
      description: "Report a completed bump (stored as an administrator report)",
      options: [{ type: 3, name: "provider", description: "Directory", required: true, choices }],
    },
    { type: 1, name: "status", description: "Show this server’s directory schedules" },
    {
      type: 1,
      name: "pause",
      description: "Pause or resume this server’s reminders",
      options: [{ type: 5, name: "paused", description: "Pause all reminders", required: true }],
    },
    { type: 1, name: "dashboard", description: "Open this server’s dashboard" },
  ],
};
export async function runCommand(env, interaction, sender = fetch, now = Date.now()) {
  const sub = interaction.data.options?.[0],
    opts = Object.fromEntries((sub?.options || []).map((o) => [o.name, o.value])),
    guild = interaction.guild_id;
  if (sub?.name === "setup") {
    await setup(
      env,
      guild,
      interaction.member.user.id,
      { channelId: opts.channel || interaction.channel_id },
      sender,
      now,
    );
    return (
      "Bump channel saved. Enable your directories with `/multibump service`, or finish setup in the dashboard: " +
      origin(env) +
      "/#server=" +
      guild
    );
  }
  if (sub?.name === "service") {
    const p = PROVIDERS[opts.provider];
    if (!p) throw new Fault(400, "provider", "Choose a directory.");
    const existing = await env.DB.prepare(
      "SELECT cooldown_minutes FROM mb_services WHERE guild_id=? AND provider=?",
    )
      .bind(guild, opts.provider)
      .first();
    const minutes =
      opts.minutes ?? existing?.cooldown_minutes ?? (p.intervalVerified ? p.cooldownMinutes : null);
    if (minutes === null)
      throw new Fault(
        400,
        "cooldown",
        "Include `minutes` using the cooldown shown by " + p.label + ".",
      );
    await service(
      env,
      guild,
      opts.provider,
      { enabled: opts.enabled, cooldownMinutes: minutes },
      now,
    );
    return p.label + " reminders " + (opts.enabled ? "enabled." : "paused.");
  }
  if (sub?.name === "done") {
    await report(env, guild, opts.provider, now);
    return "Bump reported. This is recorded as an administrator report; public provider confirmations are tracked separately.";
  }
  if (sub?.name === "pause") {
    await pause(env, guild, opts.paused, now);
    return "Reminders " + (opts.paused ? "paused." : "resumed.");
  }
  if (sub?.name === "dashboard") return origin(env) + "/#server=" + guild;
  if (sub?.name === "status") {
    const data = await snapshot(env, guild, now);
    if (!data.guild) return "Run `/multibump setup` first.";
    return (
      (data.guild.paused ? "Reminders paused.\n" : "") +
      (data.services
        .map(
          (s) =>
            PROVIDERS[s.provider].label +
            ": " +
            (!s.enabled
              ? "paused"
              : s.next_due_at <= now
                ? "due"
                : "due <t:" + Math.floor(s.next_due_at / 1000) + ":R>"),
        )
        .join("\n") || "No directories enabled yet.") +
      "\n" +
      origin(env) +
      "/#server=" +
      guild
    );
  }
  throw new Fault(400, "command", "Choose a supported /multibump command.");
}
export async function interactions(request, env, ctx, sender = fetch, now = Date.now()) {
  const i = await signature(request, env, now);
  if (i.type === 1) return json({ type: 1 });
  ready(env);
  if (
    i.type !== 2 ||
    i.application_id !== env.DISCORD_CLIENT_ID ||
    i.data?.name !== "multibump" ||
    !ID.test(i.guild_id || "") ||
    !ID.test(i.member?.user?.id || "") ||
    !manages(i.member)
  )
    return json({
      type: 4,
      data: {
        content: "Use this command in a server where you have Manage Server permission.",
        flags: 64,
      },
    });
  if (
    !ID.test(i.id || "") ||
    typeof i.token !== "string" ||
    !/^[A-Za-z0-9._-]{1,2048}$/.test(i.token)
  )
    throw new Fault(400, "interaction", "Invalid interaction.");
  const claim = await env.DB.prepare(
    "INSERT OR IGNORE INTO mb_interactions(id,expires_at) VALUES(?,?)",
  )
    .bind(i.id, now + 900000)
    .run();
  if (!claim.meta?.changes)
    return json({
      type: 4,
      data: { content: "This command has already been received.", flags: 64 },
    });
  // Signature verification and a small D1 claim precede the three-second ACK.
  // Discord/API work runs after a deferred response, never delaying the ACK.
  ctx.waitUntil(
    (async () => {
      let content;
      try {
        content = await runCommand(env, i, sender, now);
      } catch (error) {
        content = error.status
          ? error.message
          : "MultiBump could not complete this action. Try again shortly.";
      }
      try {
        await sender(
          "https://discord.com/api/v10/webhooks/" +
            env.DISCORD_CLIENT_ID +
            "/" +
            i.token +
            "/messages/@original",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
            signal: AbortSignal.timeout(8000),
          },
        );
      } catch {
        console.error("MultiBump command reply delivery failed");
      }
    })(),
  );
  return json({ type: 5, data: { flags: 64 } });
}
