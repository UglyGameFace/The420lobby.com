import { COMMAND } from "./commands.mjs";
// Supply secrets through the environment; never command arguments or source.
const app = process.env.DISCORD_CLIENT_ID,
  token = process.env.DISCORD_BOT_TOKEN;
if (!/^\d{17,20}$/.test(app || "") || !token)
  throw new Error("DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN are required.");
const response = await fetch("https://discord.com/api/v10/applications/" + app + "/commands", {
  method: "POST",
  headers: { Authorization: "Bot " + token, "Content-Type": "application/json" },
  body: JSON.stringify(COMMAND),
  signal: AbortSignal.timeout(15000),
});
// POST upserts this named command without deleting any other application commands.
if (!response.ok)
  throw new Error("Discord command registration failed (HTTP " + response.status + ").");
const result = await response.json();
console.info("Registered /" + result.name + " (" + result.id + ").");
