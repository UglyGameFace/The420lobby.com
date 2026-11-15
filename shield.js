(async function () {
  const node=document.getElementById("dank-ci");
  const access=document.getElementById("shield-role");
  if (!node || !access) return;
  try {
    const response=await fetch("/api/shield/status",{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    if (!response.ok) throw new Error("Read-only source status is unavailable");
    const data=await response.json();
    access.textContent=data.role === "owner" ? "OWNER ACCESS" : "STAFF · VIEW ONLY";
    const ci=data.dankShield?.sourceCi||{};
    const label=ci.status === "passed" ? "Latest main CI passed" : ci.status === "failed" ? "Latest main CI failed" : ci.status === "running" ? "Latest main CI running" : "GitHub CI unavailable";
    node.textContent=label+" · Live Discloud bot not verified";
    const db=data.dankShield?.database||{};
    const box=document.getElementById("dank-db");
    const runtime=document.getElementById("dank-runtime");
    if(box) {
      box.replaceChildren();
      const status=document.createElement("p");
      status.textContent=db.status==="connected" ? "Connected to Dank Shield database (read-only)" :
        db.status==="not_configured" ? "Private database connection not configured" : "Database status unavailable";
      box.append(status);
      if(db.status==="connected") {
        const open=document.createElement("strong");
        open.textContent=String(db.tickets.open)+(db.tickets.claimed ? " open · "+db.tickets.claimed+" claimed" : " open tickets");
        const recent=document.createElement("small");
        recent.textContent=String(db.activity24h.atLeast)+(db.activity24h.truncated?"+":"")+" activity events in the last 24h";
        box.append(open,recent);
      }
    }
    if(runtime)runtime.textContent="Discloud bot runtime not connected · Database numbers do not prove bot uptime";
    if(ci.runUrl && /^https:\/\/github\.com\/UglyGameFace\/Dank-Shield\/actions\/runs\/\d+$/.test(ci.runUrl)) {
      const link=document.createElement("a");
      link.href=ci.runUrl; link.textContent="View evidence";
      link.rel="noopener noreferrer";link.target="_blank";
      link.className="ci-link";
      node.append(" · ",link);
    }
  } catch {
    node.textContent="Source status unavailable · Live bot not verified";
    const box=document.getElementById("dank-db");
    if(box)box.textContent="Unable to load private database status.";
  }
})();
