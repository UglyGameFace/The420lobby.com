import {requireSession, isShieldHost, shieldRole} from "./auth.mjs";
import {HttpError, json} from "./http.mjs";
import {readDankShieldDatabase} from "./dank-shield-database.mjs";

/**
 * This is source-control evidence only. Dank Shield's live structured API is
 * localhost-only and never exposed or called by the browser or this Worker.
 */
const ACTIONS = "https://api.github.com/repos/UglyGameFace/Dank-Shield/actions/runs?branch=main&per_page=1";
export async function readShieldStatus(request, env, fetcher = fetch) {
  if (!isShieldHost(request, env)) throw new HttpError(404, "not_found", "Not found.");
  if (!/^\d{17,20}$/.test(env.BUMP_MANAGER_OWNER_ID || "")) throw new HttpError(503, "owner_setup_required", "Shield access is not configured.");
  const session = await requireSession(request, env);
  const role = shieldRole(env, session.user.id);
  if (!role) throw new HttpError(403, "staff_only", "Shield access denied.");
  let ci = {status:"unavailable", runUrl:null, headSha:null, observedAt:null};
  try {
    const response = await fetcher(ACTIONS, {
      method:"GET",
      headers:{"Accept":"application/vnd.github+json","User-Agent":"the420lobby-shield-readonly"},
      signal:AbortSignal.timeout(5000),
      cf:{cacheEverything:true,cacheTtl:300}
    });
    if (response.ok) {
      const data = await response.json();
      const run = Array.isArray(data.workflow_runs) ? data.workflow_runs[0] : null;
      if (run && typeof run.html_url === "string" && /^https:\/\/github\.com\/UglyGameFace\/Dank-Shield\/actions\/runs\/\d+$/.test(run.html_url)) {
        ci = {
          status:run.status === "completed" ? (run.conclusion === "success" ? "passed" : "failed") : "running",
          runUrl:run.html_url,
          headSha:typeof run.head_sha === "string" && /^[a-f0-9]{40}$/.test(run.head_sha) ? run.head_sha.slice(0,12) : null,
          observedAt:Date.now()
        };
      }
    }
  } catch {
    // Source unavailability must not be reported as bot downtime.
  }
  const database = await readDankShieldDatabase(env,fetcher);
  return json({
    role,
    dankShield:{
      liveBot:{status:"not_connected",note:"Discloud runtime health has not been independently connected."},
      structuredApi:{status:"private",note:"Admin API remains local and authenticated on the bot host."},
      sourceCi:ci,
      database
    },
    multiBump:{mode:"manual_reminders",clientSync:"not_connected"},
    timestamp:Date.now()
  },200,{"Cache-Control":"private, no-store"});
}
