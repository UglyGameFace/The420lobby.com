/* The 420 Lobby: Sesh Signal, a local-only 42-second community arcade challenge. */
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
  const announcement = byId("sesh-announcement");
  const progress = byId("sesh-round-progress");
  const resultText = byId("sesh-result");
  const prefersLess = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const slowMotion = () => prefersLess.matches || saveData;
  const DURATION = 42000, BEST_KEY = "the420lobby.seshsignal.best.v1";
  let audioContext = null, soundOn = false, lastAnnouncedTime = -1;
  const state = {
    mode: "idle", score: 0, combo: 0, best: 0, charge: 0,
    boostMs: 0, elapsed: 0, nextSpawn: 300, lastFrame: 0,
    nextId: 0, raf: 0, caught: 0, avoided: 0, targets: []
  };

  function safeBest() {
    try {
      const score = Number(window.localStorage.getItem(BEST_KEY));
      return Number.isFinite(score) && score > 0 && score < 10000000 ? Math.floor(score) : 0;
    } catch (_) { return 0; }
  }
  function saveBest(score) {
    try { window.localStorage.setItem(BEST_KEY, String(score)); }
    catch (_) { /* Private browsing or disabled storage: game still works. */ }
  }
  function announce(text) { announcement.textContent = text; }
  function updateHud() {
    scoreLabel.textContent = String(state.score).padStart(4, "0");
    comboLabel.textContent = "x" + String(state.combo);
    timeLabel.textContent = String(Math.ceil(Math.max(0, DURATION - state.elapsed) / 1000)).padStart(2,"0");
    bestLabel.textContent = String(state.best).padStart(4,"0");
    progress.style.width = (Math.min(100, state.elapsed / DURATION * 100)).toFixed(1) + "%";
    boostFill.style.width = (state.boostMs > 0 ? 100 : state.charge) + "%";
    boostText.textContent = state.boostMs > 0
      ? "CHILL MODE · " + Math.ceil(state.boostMs / 1000) + "s"
      : state.charge >= 100 ? "CHILL MODE READY" : "CHARGE " + state.charge + "%";
    boostButton.disabled = state.mode !== "playing" || state.charge < 100 || state.boostMs > 0;
    boostButton.textContent = state.boostMs > 0 ? "CHILL MODE ACTIVE" : "ACTIVATE CHILL MODE";
    stage.classList.toggle("chill-mode", state.boostMs > 0);
  }
  function updateControls() {
    startButton.textContent = state.mode === "playing" || state.mode === "paused" ? "RESTART ROUND" : "START NEW ROUND";
    pauseButton.disabled = state.mode !== "playing" && state.mode !== "paused";
    pauseButton.textContent = state.mode === "paused" ? "RESUME" : "PAUSE";
    shareButton.disabled = state.mode !== "finished";
    stage.dataset.mode = state.mode;
    updateHud();
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
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(90, pitch * (kind === "static" ? 0.62 : 1.25)), audioContext.currentTime + length);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.07, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + length);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + length + 0.01);
    } catch (_) { /* Audio is optional. */ }
  }
  function clearObjects() {
    state.targets.forEach(target => target.element.remove());
    state.targets.length = 0;
    bursts.replaceChildren();
  }
  function overlayMessage(title, subtitle) {
    overlay.hidden = false;
    overlay.querySelector(".sesh-overlay-title").textContent = title;
    overlay.querySelector(".sesh-overlay-copy").textContent = subtitle;
  }
  function showBurst(x, y, text, color) {
    if (slowMotion()) return;
    const mark = document.createElement("span");
    mark.className = "sesh-burst";
    mark.textContent = text;
    mark.style.left = x + "%";
    mark.style.top = y + "%";
    mark.style.setProperty("--burst-color", color);
    bursts.append(mark);
    mark.addEventListener("animationend", () => mark.remove(), {once:true});
  }
  function removeTarget(target, missed) {
    const at = state.targets.indexOf(target);
    if (at === -1) return;
    state.targets.splice(at,1);
    if (document.activeElement === target.element) stage.focus({preventScroll:true});
    target.element.remove();
    if (missed && target.kind !== "static" && state.mode === "playing") {
      state.combo = 0;
      announce("Wisp drifted away. Catch the next one!");
    } else if (missed && target.kind === "static") {
      state.avoided++;
    }
  }
  function catchTarget(target) {
    if (state.mode !== "playing" || !state.targets.includes(target)) return;
    const {kind, x, y} = target;
    if (kind === "static") {
      state.score = Math.max(0,state.score-15);
      state.combo = 0;
      showBurst(x,y,"−15","var(--ember)");
      announce("Interference! Avoid violet static.");
      playNote(170,.15,"static");
    } else {
      state.combo++;
      state.caught++;
      const points = (kind === "rare" ? 40 : 10 + Math.min(state.combo,10)*2)
        * (state.boostMs > 0 ? 2 : 1);
      state.score += points;
      if (state.boostMs === 0) state.charge = Math.min(100,state.charge+(kind === "rare" ? 40 : 18));
      showBurst(x,y,"+"+points,kind === "rare" ? "var(--ember)" : "var(--lime)");
      if (kind === "rare") announce("Golden cloud! Bonus "+points+" points.");
      else if (state.combo % 5 === 0) announce("Combo "+state.combo+". You're in the zone!");
      else announce("Wisp caught. "+points+" points.");
      playNote(kind === "rare" ? 640 : 325 + Math.min(400,state.combo*32),.11,"collect");
    }
    removeTarget(target,false);
    updateHud();
  }
  function random(min,max) { return min + Math.random()*(max-min); }
  function spawn() {
    const limit = slowMotion() ? 3 : 5;
    if (state.targets.length >= limit) return;
    const choice = Math.random();
    const kind = choice < .17 ? "static" : choice > .88 ? "rare" : "smoke";
    let x = random(13,86), y = random(19,81);
    // Keep new targets apart, including on small phone screens.
    for (let n=0;n<10 && state.targets.some(t=>Math.hypot(t.x-x,t.y-y)<19);n++) {
      x = random(13,86); y = random(19,81);
    }
    const element = document.createElement("button");
    element.type = "button";
    element.className = "sesh-wisp sesh-wisp--"+kind;
    element.setAttribute("aria-label",kind === "static" ? "Violet static, avoid" :
      kind === "rare" ? "Golden smoke, catch for bonus points" : "Green smoke, catch for points");
    element.setAttribute("title",kind === "static" ? "Avoid static" : "Catch this wisp");
    element.textContent = kind === "static" ? "✕" : kind === "rare" ? "✦" : "〰";
    element.style.left = x+"%"; element.style.top = y+"%";
    element.style.setProperty("--wisp-tilt",Math.round(random(-25,25))+"deg");
    const life = slowMotion() ? 3700 : Math.max(1550,2600-state.elapsed/DURATION*700);
    const target = {
      id:++state.nextId, kind, x, y, originY:y, age:0,
      life: state.boostMs>0 ? life*1.5 : life,
      element, phase:random(0,7)
    };
    element.addEventListener("click",()=>catchTarget(target));
    state.targets.push(target);
    layer.append(element);
  }
  function pause(reason) {
    if (state.mode !== "playing") return;
    state.mode="paused";
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf=0;state.lastFrame=0;
    overlayMessage("PAUSED",reason||"Your round is waiting. Tap Resume when ready.");
    updateControls();
    announce("Round paused.");
  }
  function resume() {
    if (state.mode !== "paused") return;
    if (document.hidden) return;
    state.mode="playing";state.lastFrame=0;overlay.hidden=true;
    updateControls();
    announce("Round resumed.");
    state.raf=requestAnimationFrame(frame);
  }
  function finish() {
    if (state.mode !== "playing") return;
    state.mode="finished";state.elapsed=DURATION;
    if(state.raf)cancelAnimationFrame(state.raf);
    state.raf=0;clearObjects();
    if(state.score>state.best){state.best=state.score;saveBest(state.best);}
    const title = state.score >= 700 ? "LOBBY LEGEND" : state.score >= 400 ? "CLOUD MASTER"
      : state.score >= 180 ? "CERTIFIED VIBER" : "FRESH IN THE LOBBY";
    overlayMessage(title,"Round complete · "+state.score+" points · "+state.caught+" wisps caught.");
    resultText.textContent = "You scored "+state.score+" points. "+title+". Personal best: "+state.best+".";
    updateControls();
    announce("Round over. "+state.score+" points. "+title+".");
    playNote(560,.35,"collect");
  }
  function frame(now) {
    state.raf=0;
    if (state.mode !== "playing") return;
    if (!state.lastFrame) state.lastFrame=now;
    const dt=Math.max(0,Math.min(70,now-state.lastFrame));
    state.lastFrame=now;
    state.elapsed=Math.min(DURATION,state.elapsed+dt);
    if (state.boostMs>0)state.boostMs=Math.max(0,state.boostMs-dt);
    if (state.elapsed>=DURATION){finish();return;}
    if(state.elapsed>=state.nextSpawn){
      spawn();
      const interval = (slowMotion() ? 1320 : 920) - Math.min(260,state.elapsed/DURATION*260);
      state.nextSpawn = state.elapsed + interval*random(.78,1.17);
    }
    for(const target of [...state.targets]){
      target.age+=dt;
      if(target.age>=target.life){removeTarget(target,true);continue;}
      // The hit target stays stationary for reliable taps and keyboard focus.
      // Smoke wisps animate only through pseudo-elements, not their button bounds.
      const lifeLeft = Math.max(0,1-target.age/target.life);
      // Keep hitbox geometry fixed. Only visual opacity fades over its lifespan.
      target.element.style.setProperty("--wisp-opacity",Math.max(.37,Math.min(1,lifeLeft*1.6)).toFixed(3));
    }
    const seconds=Math.ceil((DURATION-state.elapsed)/1000);
    if(seconds!==lastAnnouncedTime){lastAnnouncedTime=seconds;updateHud();}
    else if (state.boostMs>0) updateHud();
    state.raf=requestAnimationFrame(frame);
  }
  function start() {
    if(state.raf)cancelAnimationFrame(state.raf);
    state.raf=0;clearObjects();
    Object.assign(state,{
      mode:"playing",score:0,combo:0,charge:0,boostMs:0,elapsed:0,
      nextSpawn:250,lastFrame:0,nextId:0,caught:0,avoided:0
    });
    lastAnnouncedTime=-1;overlay.hidden=true;resultText.textContent="";
    updateControls();announce("Round started. Catch green wisps, avoid violet static.");
    stage.focus({preventScroll:true});
    state.raf=requestAnimationFrame(frame);
  }
  function boost() {
    if(state.mode!=="playing" || state.charge<100 || state.boostMs>0) return;
    state.charge=0;state.boostMs=5000;
    announce("Chill Mode activated. Double points for five seconds!");
    playNote(510,.22,"collect");
    updateHud();
  }
  function shareText() {
    const title = state.score >= 700 ? "Lobby Legend" : state.score >= 400 ? "Cloud Master" :
      state.score >= 180 ? "Certified Viber" : "Fresh in the Lobby";
    return "I scored "+state.score+" on Sesh Signal ("+title+") in The 420 Lobby! Can you beat it? https://the420lobby.com/#sesh-signal";
  }
  async function share() {
    if(state.mode!=="finished")return;
    const message=shareText();
    try{
      if(navigator.share){
        await navigator.share({title:"The 420 Lobby · Sesh Signal",text:message});
        announce("Score shared.");
      } else if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(message);
        announce("Score copied. Paste it into Discord!");
      } else {
        resultText.textContent=message;
        announce("Score ready to copy from below.");
      }
    }catch(error){
      if(error?.name!=="AbortError"){
        resultText.textContent=message;
        announce("Copy your score from the result below.");
      }
    }
  }
  startButton.addEventListener("click",start);
  pauseButton.addEventListener("click",()=>state.mode==="paused"?resume():pause());
  boostButton.addEventListener("click",boost);
  shareButton.addEventListener("click",share);
  soundButton.addEventListener("click",()=>{
    soundOn=!soundOn;
    soundButton.setAttribute("aria-pressed",String(soundOn));
    soundButton.textContent=soundOn?"SOUND ON":"SOUND OFF";
    if(soundOn)playNote(440,.12,"collect");
  });
  stage.addEventListener("keydown",event=>{
    if((event.key==="b" || event.key==="B") && state.mode==="playing") {
      event.preventDefault();boost();
    }
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)pause("Game paused because you switched apps. Your round is safe.");
  });
  window.addEventListener("pagehide",()=>pause("Session paused."));
  state.best=safeBest();
  updateControls();
})();
