import catalog from "../../tools/multibump-android/service_catalog.json" with { type: "json" };
export const PROVIDERS = Object.fromEntries(
  Object.entries(catalog).map(([id, p]) => [
    id,
    {
      id,
      label: p.label,
      applicationId: p.application_id,
      command: p.command_name,
      cooldownMinutes: p.cooldown_seconds === null ? null : p.cooldown_seconds / 60,
      helpUrl: p.help_url,
      success: p.success_patterns,
      cooldown: p.cooldown_patterns,
      intervalVerified: !["d-invites", "discodus"].includes(id),
    },
  ]),
);
export const VOTING = [
  {
    id: "tdl",
    label: "TheDiscordList",
    url: "https://thediscordlist.com/servers/",
    receipt: "signed_webhook",
    hint: "Members use the official bot’s /upvote or vote on their server listing.",
  },
  {
    id: "discadia",
    label: "Discadia",
    url: "https://discadia.com/",
    receipt: "link_only",
    hint: "Open your server listing to vote. Link visits are not counted as votes.",
  },
  {
    id: "discordify",
    label: "Discordify",
    url: "https://discordify.net/",
    receipt: "link_only",
    hint: "Vote on your server listing. Link visits are not counted as votes.",
  },
  {
    id: "d-invites",
    label: "D-INVITES",
    url: "https://discordinvites.net/",
    receipt: "link_only",
    hint: "Vote on your server listing. Link visits are not counted as votes.",
  },
];
export const choices = Object.values(PROVIDERS).map((p) => ({ name: p.label, value: p.id }));
export function confirmedProvider(message, channel, guild, now = Date.now()) {
  if (
    message.channel_id !== channel ||
    (message.guild_id && message.guild_id !== guild) ||
    !message.author?.bot ||
    message.webhook_id ||
    !/^\d{17,20}$/.test(message.id || "")
  )
    return null;
  const p = Object.values(PROVIDERS).find((p) => p.applicationId === message.author.id);
  if (!p) return null;
  // Partner adverts and ordinary bot messages cannot establish a completed command.
  if (message.interaction?.name !== p.command && message.interaction_metadata?.type !== 2)
    return null;
  if (message.interaction_metadata?.type && message.interaction_metadata.type !== 2) return null;
  if (message.interaction?.name && message.interaction.name !== p.command) return null;
  const text = [
    message.content,
    ...(message.embeds || []).flatMap((e) => [
      e.title,
      e.description,
      ...(e.fields || []).flatMap((f) => [f.name, f.value]),
    ]),
  ]
    .filter((v) => typeof v === "string")
    .join("\n")
    .toLowerCase()
    .slice(0, 16000);
  if (
    !text ||
    /\b(?:failed|failure|not bumped|unsuccessful|error|already bumped|try again|please wait)\b/i.test(
      text,
    )
  )
    return null;
  if (!p.success.some((pattern) => new RegExp(pattern, "i").test(text))) return null;
  const at = Date.parse(message.timestamp);
  if (!Number.isFinite(at) || at > now + 30000) return null;
  return { provider: p.id, sourceId: message.id, at };
}
