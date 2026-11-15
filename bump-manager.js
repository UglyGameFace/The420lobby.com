const $ = id => document.getElementById(id);
let csrfToken = null;
let services = [];
let events = [];
let editorId = null;
let role = null;
const fmt = timestamp => timestamp == null ? "Not recorded" :
  new Date(timestamp).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const remaining = (timestamp, now = Date.now()) => {
  if (timestamp <= now) return "Due now";
  const m = Math.ceil((timestamp-now)/60000);
  return m >= 1440 ? Math.floor(m/1440)+"d "+Math.ceil(m%1440/60)+"h" : m>=60 ? Math.floor(m/60)+"h "+m%60+"m" : m+"m";
};
function showMessage(message, error = false) {
  const el = $("message"); el.hidden = !message; el.textContent = message;
  el.classList.toggle("error",error);
}
function element(tag, className, value) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (value != null) e.textContent = value;
  return e;
}
async function request(path, options = {}) {
  const response = await fetch(path,{
    method:options.body === undefined ? "GET" : "POST",
    credentials:"same-origin",
    cache:"no-store",
    headers:{"Accept":"application/json",...(options.body === undefined ? {} : {
      "Content-Type":"application/json","X-CSRF-Token":csrfToken || ""
    })},
    ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)})
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("Server returned an unreadable response."); }
  if (!response.ok) {
    const error = new Error(data.error?.message || "Request failed ("+response.status+").");
    error.status = response.status; error.code = data.error?.code; throw error;
  }
  return data;
}
function act(label, handler, kind = "") {
  const btn = element("button","action "+kind,label);
  btn.type = "button";
  btn.addEventListener("click",async () => {
    btn.disabled = true; showMessage("");
    try { await handler(); } catch (error) { showMessage(error.message,true); }
    finally { btn.disabled = false; }
  });
  return btn;
}
function render() {
  const now = Date.now(), active = services.filter(s => s.enabled);
  const due = active.filter(s => s.nextDueAt <= now);
  $("active-count").textContent = String(active.length);
  $("due-count").textContent = String(due.length);
  $("next-due").textContent = active.length ? remaining(Math.min(...active.map(s => s.nextDueAt)),now) : "None";
  const list = $("services"); list.replaceChildren();
  if (!services.length) list.append(element("p","panel muted",role === "owner" ? "No services yet. Add a service using its channel URL." : "No services configured yet. The owner can add services."));
  for (const service of services) {
    const card = element("article","service");
    const top = element("div","service-top");
    const titleArea = element("div");
    const name = element("h3",null,service.name);
    const status = element("span","status "+(service.enabled ? (service.nextDueAt<=now?"due":"scheduled") : "paused"),
      service.enabled ? (service.nextDueAt<=now?"Action due":"Scheduled") : "Paused");
    titleArea.append(name,status);
    const stamp = element("div","service-time");
    stamp.append(element("span","muted","Next eligible reminder"),
      element("strong",null,service.enabled ? remaining(service.nextDueAt,now) : "Paused"));
    top.append(titleArea,stamp); card.append(top);
    const meta = element("div","service-meta");
    meta.append(element("span",null,"Cooldown "+service.cooldownMinutes+"m"),
      element("span",null,"Owner marked complete: "+fmt(service.lastCompletedAt)),
      element("span",null,"Reminder: "+service.reminderStatus.replaceAll("_"," ")));
    card.append(meta);
    const actions = element("div","button-row");
    const link = element("a","action","Open channel ↗");
    link.href = service.channelUrl;link.target = "_blank";link.rel="noopener noreferrer";
    actions.append(link);
    if (role === "owner") {
    actions.append(act("I completed this",async () => {
      if (!confirm("Record that you manually completed "+service.name+"? This is not independent confirmation.")) return;
      await request("/api/bump-manager/services/"+service.id+"/complete",{body:{}});
      await reload();
    },"primary"));
    actions.append(act(service.enabled?"Pause":"Resume",async () => {
      await request("/api/bump-manager/services/"+service.id+"/state",{body:{enabled:!service.enabled}});
      await reload();
    }));
    actions.append(act("Edit",() => { openEditor(service); }));
    actions.append(act("Archive",async () => {
      if (!confirm("Archive "+service.name+"? Its audit history will remain.")) return;
      await request("/api/bump-manager/services/"+service.id+"/archive",{body:{}});
      await reload();
    },"danger"));
    }
    card.append(actions);list.append(card);
  }
  const history = $("events"); history.replaceChildren();
  if (!events.length) history.append(element("p","muted","No recorded events."));
  for (const record of events) {
    const row = element("div","event");
    const service = services.find(s => s.id === record.serviceId);
    const description = element("div");
    description.append(element("strong",null,service?.name || "Archived service"),
      element("span",null,record.event.replaceAll("_"," ")),
      ...(record.detail ? [element("small","muted",record.detail)] : []));
    row.append(description,element("time","muted",fmt(record.at)));
    history.append(row);
  }
}
function openEditor(service = null) {
  editorId = service?.id || null;
  $("editor").hidden = false;
  $("edit-title").textContent = service ? "Edit "+service.name : "Add a bump service";
  $("save-service").textContent = service ? "Save changes" : "Add service";
  $("service-name").value = service?.name || "";
  $("channel-url").value = service?.channelUrl || "";
  $("cooldown-minutes").value = String(service?.cooldownMinutes || 120);
  $("editor").scrollIntoView({behavior:"smooth",block:"start"});
}
function closeEditor() { editorId = null; $("editor").hidden = true; $("service-form").reset(); }
async function reload() {
  const state = await request("/api/bump-manager");
  $("setup-panel").hidden = !state.setupPending;
  $("dashboard").hidden = state.setupPending;
  services = state.services;events = state.events;role = state.role;
  $("add-toggle").hidden = role !== "owner";
  $("import-config-btn").hidden = role !== "owner";
  $("setup-btn").hidden = role !== "owner";
  if (role !== "owner") closeEditor();
  if (state.setupPending) {
    $("connection").textContent = "Setup required";
  } else if (!state.scheduler?.lastTickAt) {
    $("connection").textContent = "Scheduler not yet verified";
  } else if (Date.now() - state.scheduler.lastTickAt > 15 * 60000) {
    $("connection").textContent = "Scheduler stale";
  } else if (!state.scheduler.webhookConfigured) {
    $("connection").textContent = "Scheduler online · reminder setup pending";
  } else {
    $("connection").textContent = "Scheduler online";
  }
  render();
}
async function importTermuxConfig(file) {
  if(role!=="owner")return;
  if(!file || file.size>256*1024)throw new Error("Choose a Termux config.json smaller than 256 KB.");
  let config;
  try {config=JSON.parse(await file.text())}catch {throw new Error("Not a valid Termux config.json file.");}
  if(!config || !Array.isArray(config.services))throw new Error("This file has no Termux services array.");
  // Whitelist only the public configuration fields. Never send raw file contents,
  // login tokens, per-service secrets, options, state, or response patterns.
  const seen=new Set(services.map(s=>s.name.toLowerCase()));
  const items=[];
  for(const service of config.services.slice(0,100)) {
    if(!service || service.enabled===false || String(service.guild_id)!=="1514374173517152418")continue;
    const name=typeof service.label==="string"?service.label.trim():"";
    const channel=String(service.channel_id||"");
    const seconds=Number(service.cooldown_seconds);
    const minutes=Math.ceil(seconds/60);
    if(!/^[a-z0-9][a-z0-9 ._'()-]{1,49}$/i.test(name)
      || !/^\d{17,20}$/.test(channel) || !Number.isSafeInteger(minutes)
      || minutes<15 || minutes>10080 || seen.has(name.toLowerCase()))continue;
    seen.add(name.toLowerCase());
    items.push({name,channelUrl:"https://discord.com/channels/1514374173517152418/"+channel,
      cooldownMinutes:minutes});
  }
  if(!items.length)throw new Error("No new enabled services for The 420 Lobby were found.");
  if(!confirm("Import "+items.length+" service reminder(s)? This does not copy live bump state, send /bump commands, or upload credentials."))return;
  let imported=0,skipped=0,failed=0;
  for(const body of items) {
    try {await request("/api/bump-manager/services",{body});imported++;}
    catch(error){if(error.status===409)skipped++;else failed++;}
  }
  await reload();
  showMessage("Imported "+imported+" cloud reminder(s). "+(skipped?skipped+" already existed. ":"")+
    (failed?failed+" failed. ":"")+"Current Termux cooldowns were not copied.",failed>0);
}
async function init() {
  $("add-toggle").addEventListener("click",() => {if (role === "owner") openEditor();});
  $("import-config-btn").addEventListener("click",()=>{if(role==="owner")$("import-config-file").click()});
  $("import-config-file").addEventListener("change",async event=>{
    const file=event.target.files?.[0];event.target.value="";
    const button=$("import-config-btn");button.disabled=true;
    try {await importTermuxConfig(file);}catch(error){showMessage(error.message,true);}
    finally {button.disabled=false;}
  });
  $("cancel-edit").addEventListener("click",closeEditor);
  $("refresh-btn").addEventListener("click",async () => {
    try { await reload(); showMessage(""); } catch(e){showMessage(e.message,true);}
  });
  $("setup-btn").addEventListener("click",async () => {
    if (role !== "owner") return;
    try { await request("/api/bump-manager/setup",{body:{}}); await reload(); }
    catch(e){showMessage(e.message,true);}
  });
  $("service-form").addEventListener("submit",async event => {
    event.preventDefault();
    if (role !== "owner") return;
    const submit = $("save-service"); submit.disabled = true;
    try {
      const body = {name:$("service-name").value,channelUrl:$("channel-url").value,
        cooldownMinutes:Number($("cooldown-minutes").value)};
      await request(editorId ? "/api/bump-manager/services/"+editorId+"/edit" : "/api/bump-manager/services",{body});
      closeEditor();showMessage("");await reload();
    } catch(e) {showMessage(e.message,true);}
    finally {submit.disabled = false;}
  });
  try {
    const session = await request("/api/session");
    if (!session.user) {
      $("connection").textContent = "Sign-in required";$("auth-panel").hidden = false;return;
    }
    csrfToken = session.csrfToken;
    await reload();
  } catch(error) {
    $("connection").textContent = "Unavailable";
    if (error.status === 401) $("auth-panel").hidden = false;
    showMessage(error.message,true);
  }
  document.addEventListener("visibilitychange",() => {
    if (!document.hidden && !$("dashboard").hidden) reload().catch(e => showMessage(e.message,true));
  });
}
init();
