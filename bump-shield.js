import {fetchShieldTelemetry,friendlyStatus} from "/shield-telemetry.js";
const panel=document.getElementById("dank-panel"),
  detail=document.getElementById("dank-summary"),heartbeat=document.getElementById("dank-heartbeat"),
  refreshButton=document.getElementById("dank-check");
async function refreshDank() {
  if(refreshButton)refreshButton.disabled=true;
  try {
    const data=await fetchShieldTelemetry(),status=friendlyStatus(data);
    detail.textContent=status.dbLine+(status.open!==null?" · "+status.open+" open tickets":"")+
      (status.connected?" · "+status.recentLine:"");
    heartbeat.textContent=status.heartbeatLine;
  }catch(error) {
    detail.textContent="Dank Shield evidence unavailable";
    heartbeat.textContent=error?.message||"Read-only status request failed";
  }finally {if(refreshButton)refreshButton.disabled=false;}
}
if(panel) {
  refreshButton?.addEventListener("click",refreshDank);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refreshDank()});
  void refreshDank();
}
