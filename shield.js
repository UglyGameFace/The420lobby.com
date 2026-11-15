import {fetchShieldTelemetry,friendlyStatus} from "/shield-telemetry.js";
const node=document.getElementById("dank-ci"),access=document.getElementById("shield-role"),
  box=document.getElementById("dank-db"),runtime=document.getElementById("dank-runtime"),
  activity=document.getElementById("dank-activity"),refresher=document.getElementById("dank-refresh");
async function refresh() {
  if(refresher)refresher.disabled=true;
  if(box)box.textContent="Checking live Dank Shield evidence…";
  try {
    const data=await fetchShieldTelemetry();
    const status=friendlyStatus(data);
    if(access)access.textContent=data.role==="owner"?"OWNER ACCESS":"STAFF · VIEW ONLY";
    if(box){
      box.replaceChildren();
      const heading=document.createElement("p");heading.textContent=status.dbLine;box.append(heading);
      if(status.connected&&status.open!==null){
        const tickets=document.createElement("strong");
        tickets.textContent=status.open+" open ticket"+(status.open===1?"":"s");
        box.append(tickets);
        const detail=document.createElement("small");detail.textContent=status.recentLine;box.append(detail);
      }
    }
    if(runtime)runtime.textContent=status.heartbeatLine+" · Not a direct Discloud HTTP probe";
    if(activity)activity.textContent=status.recentLine;
    if(node) {
      const ci=data.dankShield?.sourceCi||{};
      node.textContent=ci.status==="passed"?"Latest main CI passed":
        ci.status==="failed"?"Latest main CI failed":ci.status==="running"?"Latest main CI running":"GitHub CI unavailable";
      if(ci.runUrl&&/^https:\/\/github\.com\/UglyGameFace\/Dank-Shield\/actions\/runs\/\d+$/.test(ci.runUrl)){
        const a=document.createElement("a");a.href=ci.runUrl;a.textContent="View CI";
        a.rel="noopener noreferrer";a.target="_blank";a.className="ci-link";node.append(" · ",a);
      }
    }
  } catch(e) {
    if(box)box.textContent="Private connection check unavailable.";
    if(runtime)runtime.textContent=e.message;
    if(node)node.textContent="GitHub CI status unavailable";
  } finally {if(refresher)refresher.disabled=false;}
}
if(refresher)refres.addEventListener("click",refresh);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refresh()});
void refresh();
