import {HttpError, json} from "./http.mjs";

// The provider sends this event for a real completed server upvote.
// This webhook is a RECEIPT, not a vote-submission endpoint.
export const TDL_VOTE_EVENT = "listing.upvoted";
export const LOBBY_GUILD_ID = "1514374173517152418";
const MAX_BYTES = 32768;
const MAX_DRIFT_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE = /^t=(\d{10,11}),v1=([0-9a-f]{64})$/i;
const decoder = new TextDecoder("utf-8", {fatal: true});
const encoder = new TextEncoder();

function equalHex(expectedBytes, providedHex) {
  if (providedHex.length !== expectedBytes.length * 2) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    const byte = Number.parseInt(providedHex.slice(i * 2, i * 2 + 2), 16);
    mismatch |= expectedBytes[i] ^ byte;
  }
  return mismatch === 0;
}

export async function signedTDLRequest(request, secret, nowMs = Date.now(), listingId = LOBBY_GUILD_ID) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new HttpError(503, "vote_webhook_unconfigured",
      "TDL webhook reception is not configured.");
  }
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "json_required", "Send JSON.");
  }
  const delivery = request.headers.get("X-TDL-Delivery") || "";
  const signature = SIGNATURE.exec(request.headers.get("X-TDL-Signature") || "");
  if (!signature || !UUID.test(delivery)) {
    throw new HttpError(401, "invalid_vote_signature", "Invalid webhook authentication.");
  }
  const signedAt = Number(signature[1]);
  if (!Number.isSafeInteger(signedAt) ||
      Math.abs(Math.floor(nowMs / 1000) - signedAt) > MAX_DRIFT_SECONDS) {
    throw new HttpError(401, "expired_vote_signature", "Webhook signature expired.");
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_BYTES) throw new HttpError(413, "payload_too_large", "Webhook too large.");

  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "empty_body", "Webhook body is required.");
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "payload_too_large", "Webhook too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  for (let p = 0, i = 0; i < chunks.length; i++) {
    body.set(chunks[i], p); p += chunks[i].length;
  }
  const prefix = encoder.encode(signature[1] + ".");
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix); signed.set(body, prefix.length);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  if (!equalHex(expected, signature[2])) {
    throw new HttpError(401, "invalid_vote_signature", "Invalid webhook authentication.");
  }

  let payload;
  try {
    payload = JSON.parse(decoder.decode(body));
  } catch {
    throw new HttpError(400, "invalid_vote_event", "Invalid JSON payload.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "invalid_vote_event", "Expected JSON object.");
  }
  // Only count accepted votes for this server's listing. Ignore ping/test
  // events with a success ACK but without an event receipt.
  if (payload.event === "webhook.ping") return {delivery, ping: true};
  if (payload.event !== TDL_VOTE_EVENT || payload.listing?.type !== "server" ||
      String(payload.listing?.id || "") !== listingId ||
      !payload.data || typeof payload.data !== "object" ||
      !payload.data.user?.id) {
    throw new HttpError(422, "unexpected_vote_event", "Not a vote for this server.");
  }
  return {delivery, ping: false, eventId: payload.id, occurredAt: payload.created_at};
}

export async function handleTDLVoteWebhook(request, env, nowMs = Date.now()) {
  if (!env.DB?.prepare) {
    throw new HttpError(503, "vote_store_unavailable", "Vote receipt storage is unavailable.");
  }
  const receipt = await signedTDLRequest(request, env.TDL_WEBHOOK_SECRET, nowMs);
  if (receipt.ping) return json({received: true, ping: true});
  // No user IDs, private webhook payloads, or account tokens are retained.
  // SQLite's primary key deduplicates retries and parallel deliveries.
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO tdl_vote_receipts (delivery_id, listing_id, received_at) VALUES (?, ?, ?)"
  ).bind(receipt.delivery.toLowerCase(), LOBBY_GUILD_ID, Math.floor(nowMs / 1000)).run();
  return json({received: true, duplicate: Number(inserted.meta?.changes || 0) === 0});
}
