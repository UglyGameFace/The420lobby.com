export const friendlyStatus = data => {
  const db=data?.dankShield?.database||{};
  const live=data?.dankShield?.liveBot||{};
  const reason=db.reason||"";
  const problem=reason==="missing_signing_key"?"Signing key missing from production"
    :reason==="upstream_http_401"?"Signed request rejected by Dank Shield (401)"
    :reason==="upstream_http_403"?"Signed request forbidden by Dank Shield (403)"
    :reason==="upstream_http_404"?"Dank Shield endpoint not found (404)"
    :reason==="upstream_http_503"?"Dank Shield database service unavailable (503)"
    :reason==="timeout"?"Dank Shield connection timed out"
    :reason==="transport_or_crypto_error"?"Secure connection or signing failed"
    :reason==="unexpected_response"?"Dank Shield returned an unexpected response"
    :reason.startsWith("upstream_http_")?"Dank Shield returned "+reason.replace("upstream_http_","HTTP ")
    :"Connection not independently verified";
  const dbLine=db.status==="connected"?"Connected to Dank Shield database · read only":
    db.status==="not_configured"?"Database link needs configuration":problem;
  const open=Number.isSafeInteger(db.tickets?.open)?db.tickets.open:null;
  const recent=Number.isSafeInteger(db.activity24h?.atLeast)?db.activity24h.atLeast:null;
  const recentLine=recent===null?"Recent activity unavailable":recent+(db.activity24h?.truncated?"+":"")+" recorded activity events in the past 24h";
  const at=live.lastSeenAt ? Date.parse(live.lastSeenAt) : NaN;
  const age=Number.isFinite(at)?Math.max(0,Math.floor((Date.now()-at)/60000)):null;
  // The server assigns heartbeat_recent using its own six-minute freshness gate.
  // Recheck client-side in case an old page was left open for hours.
  const fresh=live.status==="heartbeat_recent"&&age!==null&&age<6;
  const heartbeatLine=fresh?"Bot heartbeat recent · "+live.guildCount+" guilds · "+age+"m old":
    age!==null?"Bot heartbeat stale or unverified · last report "+age+"m ago":
    "Bot heartbeat not verified";
  return {dbLine,heartbeatLine,open,recentLine,connected:db.status==="connected",checkedAt:db.checkedAt||data?.timestamp||null};
};
export async function fetchShieldTelemetry() {
  const response=await fetch("/api/shield/status",{credentials:"same-origin",cache:"no-store",
    headers:{"Accept":"application/json"},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error("Shield status request failed (HTTP "+response.status+").");
  return response.json();
}
