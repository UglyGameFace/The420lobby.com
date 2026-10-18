/* The 420 Lobby: Sesh Signal. Ranked rounds require a server session. */
(function () {
  "use strict";
  const byId = id => document.getElementById(id);
  const stage = byId("sesh-stage");
  if (!stage) return;
  const layer = byId("sesh-target-layer"), bursts = byId("sesh-burst-layer");
  const overlay = byId("sesh-overlay"), startButton = byId("sesh-start");
  const pauseButton = byId("sesh-pause"), boostButton = byId("sesh-boost");
  const shareButton = byId("sesh-share"), soundButton = byId("sesh-sound");
  const scoreLabel = byId("sesh-score"), comboLabel = byId("sesh-combo");
  const timeLabel = byId("sesh-time"), bestLabel = byId("sesh-best");
  const boostFill = byId("sesh-charge-fill"), boostText = byId("sesh-charge-text");
  const announcement = byId("sesh-announcement"), progress = byId("sesh-round-progress");
  const resultText = byId("sesh-result"), authStatus = byId("sesh-auth-status");
  const loginLink = byId("sesh-login");
  const prefersLess = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const DURATION = 42000, MAX_PAUSE = 120000;
  const SAFE_GEAR = ["lighter","grinder","papers"];
  const HAZARDS = ["broken-bong","broken-pipe"];
  const ITEM_LABELS = {
    lighter:"Pocket lighter", grinder:"Herb grinder", papers:"Rolling papers",
    "clean-glass":"Clean glass piece", "broken-bong":"Broken bong glass",
    "broken-pipe":"Broken glass pipe"
  };
  const elements = new Map();
  let api, rules, media, engine, session, run, events = [], started = 0, raf = 0;
  let mode = "loading", best = 0, score = 0, soundOn = false, audioContext;
  let snapshot = null, finishPayload = null, pauseTimeout = 0;
  let generation = 0, lastAnnouncedTime = -1, savedScore = false;
  const isHazard = kind => HAZARDS.includes(kind);
  const wallTime = () => Math.max(0, Math.floor(performance.now() - started));
  const announce = text => { announcement.textContent = text; };
  const status = text => { if (authStatus) authStatus.textContent = text; };
  function overlayMessage(title, text) {
    overlay.hidden = false;
    overlay.querySelector(".sesh-overlay-title").textContent = title;
    overlay.querySelector(".sesh-overlay-copy").textContent = text;
  }
  function clearObjects() {
    for (const element of elements.values()) element.remove();
    elements.clear(); bursts.replaceChildren();
  }
  function stopClock() {
    cancelAnimationFrame(raf); raf = 0; clearTimeout(pauseTimeout);
  }
  function controls() {
    const busy = mode === "loading" || mode === "starting" || mode === "saving";
    startButton.disabled = busy || (session && !session.configured);
    startButton.textContent = busy ? (mode === "saving" ? "SAVING SCORE…" : "CONNECTING…")
      : finishPayload ? "RETRY SAVING SCORE" : !session ? "RETRY CONNECTION"
      : !session.configured ? "SIGN-IN AWAITS SETUP" : !session.user ? "SIGN IN WITH DISCORD"
      : mode === "playing" || mode === "paused" ? "RESTART ROUND" : "START NEW ROUND";
    pauseButton.disabled = mode !== "playing" && mode !== "paused";
    pauseButton.textContent = mode === "paused" ? "RESUME" : "PAUSE";
    shareButton.disabled = mode !== "finished" || !savedScore;
    boostButton.disabled = mode !== "playing" || !snapshot || snapshot.charge < 100 || snapshot.boostUntil > snapshot.elapsedMs;
    stage.dataset.mode = mode;
    if (loginLink) loginLink.hidden = !!session?.user;
  }
  function updateHud() {
    const s = snapshot;
    scoreLabel.textContent = String(s?.score || 0).padStart(4, "0");
    comboLabel.textContent = "x" + (s?.combo || 0);
    timeLabel.textContent = String(Math.ceil((s?.remainingMs ?? DURATION) / 1000)).padStart(2, "0");
    bestLabel.textContent = String(best).padStart(4, "0");
    progress.style.width = Math.min(100, (s?.elapsedMs || 0) / DURATION * 100) + "%";
    const boostMs = s ? Math.max(0, s.boostUntil - s.elapsedMs) : 0;
    boostFill.style.width = (boostMs ? 100 : s?.charge || 0) + "%";
    boostText.textContent = boostMs ? "CHILL MODE · " + Math.ceil(boostMs / 1000) + "s"
      : s?.charge >= 100 ? "CHILL MODE READY" : "CHARGE " + (s?.charge || 0) + "%";
    boostButton.textContent = boostMs ? "CHILL MODE ACTIVE" : "ACTIVATE CHILL MODE";
    stage.classList.toggle("chill-mode", boostMs > 0);
    document.querySelectorAll(".sesh-kit-tracker [data-kit]").forEach(slot => {
      const collected = SAFE_GEAR.includes(slot.dataset.kit) && !!s?.kit?.includes(slot.dataset.kit);
      slot.classList.toggle("is-collected", collected);
      slot.querySelector("b").textContent = collected ? "✓" : "○";
    });
    controls();
  }
  function playNote(pitch, length, kind) {
    if (!soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioContext) audioContext = new AC();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = kind === "static" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(pitch, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(90, pitch * (kind === "static" ? .62 : 1.25)), audioContext.currentTime + length);
      gain.gain.setValueAtTime(.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.07, audioContext.currentTime + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + length);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + length + .01);
    } catch (_) { /* Sound is optional. */ }
  }
  function showBurst(target, text) {
    if (prefersLess.matches || saveData) return;
    const mark = document.createElement("span");
    mark.className = "sesh-burst"; mark.textContent = text;
    mark.style.left = target.x + "%"; mark.style.top = target.y + "%";
    mark.style.setProperty("--burst-color", isHazard(target.kind) ? "var(--ember)" : "var(--lime)");
    bursts.append(mark);
    mark.addEventListener("animationend", () => mark.remove(), {once:true});
  }
  function renderTargets() {
    const active = new Set((snapshot?.targets || []).map(target => target.id));
    for (const [id, element] of elements) if (!active.has(id)) {
      if (document.activeElement === element) stage.focus({preventScroll:true});
      element.remove(); elements.delete(id);
    }
    for (const target of snapshot?.targets || []) {
      let element = elements.get(target.id);
      if (!element) {
        element = document.createElement("button"); element.type = "button";
        element.className = "sesh-item sesh-item--" + target.kind + (isHazard(target.kind) ? " sesh-item--hazard" : "");
        element.dataset.targetId = String(target.id);
        element.setAttribute("aria-label", ITEM_LABELS[target.kind] + (isHazard(target.kind) ? ", avoid clicking" : ", tap to collect"));
        element.title = ITEM_LABELS[target.kind] + (isHazard(target.kind) ? " · BROKEN · AVOID" : " · COLLECT");
        const photo = media?.createPhoto(target.kind,"sesh-item-art sesh-item-photo");
        if(photo) element.append(photo);
        const caption = document.createElement("span");
        caption.className = "sesh-item-caption";
        caption.textContent = ITEM_LABELS[target.kind];
        caption.setAttribute("aria-hidden","true");
        element.append(caption);
        element.style.left = target.x + "%"; element.style.top = target.y + "%";
        element.addEventListener("click", () => catchTarget(target));
        elements.set(target.id, element); layer.append(element);
      }
      const life = Math.max(1, target.expiresAt - target.spawnAt);
      element.style.setProperty("--wisp-opacity", Math.max(.37, Math.min(1, (target.expiresAt - snapshot.elapsedMs) / life * 1.6)).toFixed(3));
      element.disabled = mode !== "playing";
    }
  }
  function expire(text) {
    stopClock(); mode = "expired"; finishPayload = null; clearObjects();
    overlayMessage("ROUND EXPIRED", text);
    resultText.textContent = text + " Start a new round to play again.";
    announce(resultText.textContent); controls();
  }
  function dispatch(type, fields = {}) {
    if (mode !== "playing" && type !== "resume") return false;
    const event = {type, ...fields, at:wallTime()};
    try { snapshot = engine.dispatch(event); events.push(event); return true; }
    catch (error) {
      if (type === "resume") expire("The two-minute pause allowance has ended.");
      else if (error.code === "pause_limit") announce("Your pause allowance has been used. This round is still running.");
      else if (error.code === "boost_not_ready") announce("Chill Mode is still charging. Collect more gear first.");
      else announce("Wait for the item to settle, then tap. Your round is still running.");
      return false;
    }
  }
  function catchTarget(target) {
    if (mode !== "playing") return;
    const before = snapshot.score;
    if (!dispatch("catch", {id:target.id})) return;
    const points = snapshot.score - before;
    showBurst(target, points < 0 ? "−" + Math.abs(points) : "+" + points);
    announce(isHazard(target.kind) ? "Broken glass! Combo and sesh-kit progress reset. Leave cracked glass alone."
      : ITEM_LABELS[target.kind] + " collected. +" + points + " points.");
    playNote(isHazard(target.kind) ? 170 : target.kind === "clean-glass" ? 640 : 325 + Math.min(400, snapshot.combo * 32), .12, isHazard(target.kind) ? "static" : "collect");
    renderTargets(); updateHud();
  }
  function boost() {
    if (!dispatch("boost")) return;
    announce("Chill Mode activated. Double points for five seconds!");
    playNote(510,.22,"collect"); updateHud();
  }
  function pause(reason) {
    if (mode !== "playing" || !dispatch("pause")) return;
    mode = "paused"; stopClock();
    overlayMessage("PAUSED", reason || "Tap Resume when ready. Ranked rounds allow two minutes of total pause time.");
    pauseTimeout = setTimeout(() => expire("The two-minute pause allowance has ended."), Math.max(1, MAX_PAUSE - snapshot.pausedMs));
    updateHud(); renderTargets(); announce("Round paused. Two minutes of total pause time are available.");
  }
  function resume() {
    if (mode !== "paused" || document.hidden) return;
    if (!dispatch("resume")) return;
    clearTimeout(pauseTimeout); mode = "playing"; overlay.hidden = true;
    updateHud(); renderTargets(); announce("Round resumed."); raf = requestAnimationFrame(frame);
  }
  async function saveScore() {
    if (!finishPayload) return;
    mode = "saving"; controls(); status("Checking your round and saving your score…");
    const current = generation;
    try {
      const saved = await api.saveAuthenticatedRun(run, session, finishPayload.events, finishPayload.elapsedMs);
      if (current !== generation) return;
      finishPayload = null; mode = "finished"; savedScore = true; score = saved.score; best = saved.best; snapshot.score = saved.score;
      const title = score >= 700 ? "LOBBY LEGEND" : score >= 400 ? "SESH MASTER" : score >= 180 ? "CERTIFIED VIBER" : "FRESH IN THE LOBBY";
      overlayMessage(title, "Round complete · " + score + " points · saved to your Discord profile.");
      resultText.textContent = score + " points saved. Personal best: " + best + ".";
      status("Score verified and saved to your Discord profile.");
      announce(resultText.textContent); api.notifyScoreSaved(saved); updateHud();
    } catch (error) {
      if (current !== generation) return;
      mode = "finished";
      const invalid = error.status >= 400 && error.status < 500 && ![408,429].includes(error.status);
      if (invalid) finishPayload = null;
      overlayMessage(invalid ? "SCORE NOT SAVED" : "SAVE INTERRUPTED", error.message);
      resultText.textContent = error.message + (invalid ? " Start a new round to try again." : " Use Retry Saving Score to send this same round again.");
      status(resultText.textContent); announce(resultText.textContent); controls();
    }
  }
  function finish() {
    if (mode !== "playing") return;
    stopClock(); clearObjects(); score = snapshot.score;
    finishPayload = {events:events.slice(), elapsedMs:wallTime()};
    overlayMessage("ROUND COMPLETE", "Checking your round and saving your score…");
    playNote(560,.35,"collect"); saveScore();
  }
  function frame() {
    raf = 0;
    if (mode !== "playing") return;
    try { engine.advance(wallTime()); snapshot = engine.snapshot(); }
    catch (_) { expire("This round exceeded its allowed time."); return; }
    if (snapshot.finished) { finish(); return; }
    renderTargets();
    const seconds = Math.ceil(snapshot.remainingMs / 1000);
    if (seconds !== lastAnnouncedTime || snapshot.boostUntil > snapshot.elapsedMs) { lastAnnouncedTime = seconds; updateHud(); }
    raf = requestAnimationFrame(frame);
  }
  async function checkSession() {
    session = await api.arcadeRequest("/api/session");
    status(!session.configured ? "Discord sign-in is awaiting server setup."
      : session.user ? "Playing as " + session.user.username + ". Scores save to your Discord profile."
      : "Sign in with Discord before playing. Your scores and achievements follow your profile.");
    if (session.user) try {
      const profile = await api.arcadeRequest("/api/profile");
      best = Number(profile?.bests?.find(item => item.game === "sesh-signal")?.score || 0);
    } catch (_) { /* Best refreshes after the first verified score. */ }
  }
  async function start() {
    if (mode === "loading" || mode === "starting" || mode === "saving") return;
    if (finishPayload) { await saveScore(); return; }
    generation++; const current = generation;
    stopClock(); clearObjects(); savedScore = false; mode = "starting"; controls();
    overlayMessage("CONNECTING", "Checking your Discord session and preparing a ranked round…");
    try {
      if (!api || !rules) [api, rules] = await Promise.all([import("/arcade-api.js"), import("/shared/arcade-rules.mjs")]);
      const authorized = await api.startAuthenticatedRun("sesh-signal");
      if (current !== generation) return;
      session = authorized.session; run = authorized.run; engine = rules.createEngine("sesh-signal", run.seed);
      events = []; started = performance.now(); snapshot = engine.snapshot();
      mode = "playing"; lastAnnouncedTime = -1; overlay.hidden = true; resultText.textContent = "";
      status("Playing as " + session.user.username + ". Round active.");
      updateHud(); announce("Round started. Collect lighter, grinder and papers. Avoid broken glass.");
      stage.focus({preventScroll:true});
      if (window.innerWidth <= 900) stage.scrollIntoView({behavior:"instant",block:"center"});
      raf = requestAnimationFrame(frame);
    } catch (error) {
      if (current !== generation) return;
      if (error.code === "login_required") { window.location.assign("/auth/discord"); return; }
      mode = "idle"; session = error.code === "not_configured" ? {configured:false,user:null} : null;
      overlayMessage("CONNECTION NEEDED", error.message || "The arcade could not connect. Please try again.");
      status(error.message || "The arcade could not connect. Please try again."); announce(error.message || "Connection unavailable."); controls();
    }
  }
  async function share() {
    if (mode !== "finished" || !savedScore) return;
    const message = "I scored " + score + " on Sesh Signal in The 420 Lobby! Can you beat it? https://the420lobby.com/#sesh-signal";
    try {
      if (navigator.share) await navigator.share({title:"The 420 Lobby · Sesh Signal",text:message});
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(message); announce("Score copied. Paste it into Discord!"); }
      else resultText.textContent = message;
    } catch (error) { if (error.name !== "AbortError") resultText.textContent = message; }
  }
  startButton.addEventListener("click",start);
  pauseButton.addEventListener("click", () => mode === "paused" ? resume() : pause());
  boostButton.addEventListener("click",boost); shareButton.addEventListener("click",share);
  soundButton.addEventListener("click", () => {
    soundOn = !soundOn; soundButton.setAttribute("aria-pressed",String(soundOn));
    soundButton.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
    if (soundOn) playNote(440,.12,"collect");
  });
  stage.addEventListener("keydown", event => {
    if ((event.key === "b" || event.key === "B") && mode === "playing") { event.preventDefault(); boost(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause("You switched apps. Resume within the two-minute total pause allowance.");
  });
  window.addEventListener("pagehide", () => pause("Session paused. Resume within two minutes."));
  updateHud();
  Promise.all([import("/arcade-api.js"), import("/shared/arcade-rules.mjs"), import("/shared/arcade-media.mjs").catch(() => null)]).then(async modules => {
    [api, rules, media] = modules; await checkSession(); mode = "idle";
    if (!session.user) overlayMessage("DISCORD REQUIRED", "Sign in securely with Discord before starting a round. Scores and achievements save to your profile.");
    updateHud();
  }).catch(error => {
    mode = "idle"; session = null;
    status(error.message || "The arcade server could not be reached. Try again to reconnect.");
    overlayMessage("CONNECTION NEEDED", "The arcade server could not be reached. Try again to reconnect."); controls();
  });
})();
