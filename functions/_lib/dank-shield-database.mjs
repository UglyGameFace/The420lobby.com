/* Signed read-only Dank Shield database adapter. Never call the localhost bot admin API. */
const STATUS_URL = "https://viamriafkbqhquvrsnua.supabase.co/functions/v1/shield-aggregate-status";
function decodeB64url(input) {
  const raw=atob(input.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(input.length/4)*4,"="));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function encodeB64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
const failed=(reason,checkedAt)=>({status:"unavailable",reason,checkedAt,
  note:"Private Dank Shield database evidence could not be verified."});
export async function readDankShieldDatabase(env, fetcher=fetch) {
  const checkedAt=Date.now(),keyB64u=env.DANK_SHIELD_SIGNING_KEY;
  if (typeof keyB64u!=="string" || !/^[A-Za-z0-9_-]{60,160}$/.test(keyB64u)) {
    return {status:"not_configured",reason:"missing_signing_key",checkedAt,
      note:"Encrypted read-only Dank Shield connector is not configured."};
  }
  let response;
  try {
    const key=await crypto.subtle.importKey("pkcs8",decodeB64url(keyB64u),{name:"Ed25519"},false,["sign"]);
    const ts=String(Date.now());
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
    const signature=encodeB64url(new Uint8Array(await crypto.subtle.sign("Ed25519",key,
      new TextEncoder().encode("GET\n/shield-aggregate-status\n"+ts+"\n"+nonce))));
    response=await fetcher(STATUS_URL,{method:"GET",headers:{
      "Accept":"application/json","x-shield-timestamp":ts,"x-shield-nonce":nonce,"x-shield-signature":signature
    },signal:AbortSignal.timeout(6500)});
  }catch(error) {
    return failed(error?.name==="TimeoutError"?"timeout":"transport_or_crypto_error",checkedAt);
  }
  if(!response.ok) {
    const status=Number.isInteger(response.status)&&response.status>=400&&response.status<=599?response.status:502;
    return failed("upstream_http_"+status,checkedAt);
  }
  let data;
  try{data=await response.json()}catch{return failed("unreadable_response",checkedAt)}
  if(data?.ok!==true || data.source!=="dank-shield-supabase" || data.kind!=="database_snapshot"
    || !Number.isSafeInteger(data.tickets?.open) || data.tickets.open<0
    || !Number.isSafeInteger(data.activity24h?.atLeast) || data.activity24h.atLeast<0
    || !["heartbeat_recent","stale","reported_not_online","not_reported"].includes(data.runtime?.status)
  )return failed("unexpected_response",checkedAt);
  return {status:"connected",checkedAt,source:"Dank Shield Supabase",capturedAt:data.capturedAt||null,
    configUpdatedAt:data.configUpdatedAt||null,tickets:data.tickets,activity24h:data.activity24h,
    runtime:data.runtime};
}
