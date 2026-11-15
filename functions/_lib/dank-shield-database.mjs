/* Signed read-only Dank Shield database adapter. Never call the localhost bot admin API. */
const STATUS_URL = "https://viamriafkbqhquvrsnua.supabase.co/functions/v1/shield-aggregate-status";

function decodeB64url(input) {
  const raw=atob(input.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(input.length/4)*4,"="));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function encodeB64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
export async function readDankShieldDatabase(env, fetcher=fetch) {
  const keyB64u=env.DANK_SHIELD_SIGNING_KEY;
  if (typeof keyB64u!=="string" || !/^[A-Za-z0-9_-]{60,160}$/.test(keyB64u)) {
    return {status:"not_configured",note:"The private read-only Dank Shield database link is not configured."};
  }
  try {
    const key=await crypto.subtle.importKey("pkcs8",decodeB64url(keyB64u),{name:"Ed25519"},false,["sign"]);
    const ts=String(Date.now());
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const nonce=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    const message=new TextEncoder().encode("GET\n/shield-aggregate-status\n"+ts+"\n"+nonce);
    const sig=encodeB64url(new Uint8Array(await crypto.subtle.sign("Ed25519",key,message)));
    const response=await fetcher(STATUS_URL,{
      method:"GET",
      headers:{"Accept":"application/json","x-shield-timestamp":ts,"x-shield-nonce":nonce,"x-shield-signature":sig},
      signal:AbortSignal.timeout(6500)
    });
    if(!response.ok)throw Error("Source unavailable");
    const data=await response.json();
    if(data?.ok!==true || data.source!=="dank-shield-supabase" || data.kind!=="database_snapshot"
      || typeof data.tickets?.open!=="number" || typeof data.activity24h?.atLeast!=="number")
      throw Error("Unrecognized source response");
    return {status:"connected",source:"Dank Shield Supabase",capturedAt:data.capturedAt||null,
      configUpdatedAt:data.configUpdatedAt||null,
      tickets:data.tickets,activity24h:data.activity24h};
  }catch {
    return {status:"unavailable",note:"The private Dank Shield database snapshot could not be verified."};
  }
}
