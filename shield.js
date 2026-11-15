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
    if(ci.runUrl && /^https:\/\/github\.com\/UglyGameFace\/Dank-Shield\/actions\/runs\/\d+$/.test(ci.runUrl)) {
      const link=document.createElement("a");
      link.href=ci.runUrl; link.textContent="View evidence";
      link.rel="noopener noreferrer";link.target="_blank";
      link.className="ci-link";
      node.append(" · ",link);
    }
  } catch {
    node.textContent="Source status unavailable · Live bot not verified";
  }
})();
