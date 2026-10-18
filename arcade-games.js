import {createEngine, GAME_CONFIG, LIMITS} from "/shared/arcade-rules.mjs";
import {startAuthenticatedRun, saveAuthenticatedRun, notifyScoreSaved} from "/arcade-api.js";
import {createPhoto} from "/shared/arcade-media.mjs";

const LABELS = {
  lighter:"Lighter", grinder:"Grinder", papers:"Rolling papers",
  "clean-glass":"Blue glass hand pipe", leaf:"Cannabis leaf", bong:"Green glass bong"
};
const SHORT_LABELS = {lighter:"LIGHTER",grinder:"GRINDER",papers:"PAPERS","clean-glass":"GLASS PIPE",leaf:"LEAF",bong:"BONG"};
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(className, text) {
  const element = node("button", className, text); element.type = "button"; return element;
}
function art(kind) {
  // Real photographic imagery replaces fake vector paraphernalia.
  // Gameplay and button accessibility are independent of network media success.
  return createPhoto(kind,"mini-art mini-art-photo" + (kind==="leaf"?" mini-leaf":""));
}

/** Mounts an authenticated cabinet. The returned function releases its round. */
export function mountGame(container, gameId, initialSession) {
  if (!container || !["green-room-match", "bong-blitz"].includes(gameId)) throw new Error("Unknown arcade game.");
  const config = GAME_CONFIG[gameId], memory = gameId === "green-room-match";
  const shell = node("section", "mini-game mini-game--" + gameId);
  shell.setAttribute("aria-label", config.title + " game cabinet");
  const header = node("div", "mini-heading");
  const eyebrow = node("p", "mini-kicker", memory ? "MEMORY / 45 SECONDS" : "REACTION / 30 SECONDS");
  const heading = node("h2", "mini-title", config.title);
  const instructions = node("p", "mini-instructions", memory
    ? "Find six matching pairs before the timer runs out. Remember your gear; faster pairs earn more points."
    : "Wait for the timing ring to meet the green sweet spot, then tap the glass pipe. Perfect timing earns the biggest score.");
  header.append(eyebrow, heading, instructions);
  const hud = node("div", "mini-hud");
  function metric(label, className, value) {
    const wrapper = node("div", "mini-metric");
    const output = node("strong", className, value);
    wrapper.append(node("span", "", label), output); hud.append(wrapper); return output;
  }
  const scoreLabel = metric("SCORE", "mini-score", "0000");
  const timeLabel = metric("TIME", "mini-timer", String(config.durationMs / 1000));
  const statLabel = metric(memory ? "PAIRS" : "PERFECT", "mini-stat", memory ? "0 / 6" : "0");
  const board = node("div", "mini-board" + (memory ? " mini-memory-board" : " mini-timing-board"));
  board.tabIndex = 0;
  board.setAttribute("role", "group"); board.setAttribute("aria-label", config.title + " playfield");
  const targetLayer = node("div", memory ? "mini-cards" : "mini-targets");
  const overlay = node("div", "mini-overlay");
  const overlayTitle = node("strong", "mini-overlay-title", memory ? "GOOD MEMORY?" : "FIND YOUR RHYTHM.");
  const overlayCopy = node("p", "", "Your Discord profile keeps your scores and achievements. Ready when you are.");
  overlay.append(art(memory ? "leaf" : "bong"), overlayTitle, overlayCopy);
  board.append(targetLayer, overlay);
  const controls = node("div", "mini-controls");
  const startButton = button("mini-start", "START ROUND");
  const pauseButton = button("mini-pause", "PAUSE"); pauseButton.disabled = true;
  const soundButton=button("mini-sound","SOUND OFF");
  soundButton.setAttribute("aria-pressed","false");
  soundButton.setAttribute("aria-label","Toggle optional game sound");
  controls.append(startButton, pauseButton, soundButton);
  const status = node("p", "mini-status", "Signed in as " + (initialSession?.user?.username || "guest") + ".");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const keyboard = node("p", "mini-keyboard", memory
    ? "Touch or click a card. Keyboard: Tab and Enter, or arrow keys to move between cards."
    : "Touch or click the glass. Keyboard: focus the board and press Space or Enter when the rings meet.");
  const pauseNote = node("p", "mini-pause-note", "Pause anytime · up to 2 minutes total per round. Scores are checked by the server.");
  const progress= node("div","mini-progress");
  progress.setAttribute("role","progressbar");
  progress.setAttribute("aria-label","Round progress");
  progress.setAttribute("aria-valuemin","0");
  progress.setAttribute("aria-valuemax","100");
  progress.setAttribute("aria-valuenow","0");
  const progressFill=node("span","mini-progress-fill");
  progress.append(progressFill);
  const actionStrip=node("div","mini-action-strip");
  const actionLabel=node("strong","mini-action-label",memory?"FIND THE MATCHES":"TIME YOUR TAP");
  const actionDetail=node("span","mini-action-detail",memory?"Pair the six unique photographs.":"Tap when the ring meets the green zone.");
  actionStrip.append(actionLabel,actionDetail);
  shell.append(header, hud, progress, actionStrip, board, controls, status, keyboard, pauseNote);
  container.replaceChildren(shell);

  let engine, snapshot, session = initialSession, run, started = 0, events = [];
  let mode = "idle", raf = 0, pauseTimer = 0, disposed = false, pendingSave = null;
  let generation = 0, lastWallMs = 0, soundOn = false, soundContext = null;
  const motionReduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new AbortController(), elements = new Map();
  function wallTime() {
    // Browser scheduling can report an earlier sample than the last input/frame.
    // Preserve the replay protocol's monotonic wall clock at its source.
    lastWallMs = Math.max(lastWallMs, 0, Math.floor(performance.now() - started));
    return lastWallMs;
  }
  const say = text => { status.textContent = text; };
  function playSound(high=false){
    if(!soundOn)return;
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      soundContext ||=new Audio();
      if(soundContext.state==="suspended")soundContext.resume().catch(()=>{});
      const osc=soundContext.createOscillator(), gain=soundContext.createGain();
      osc.type="sine";
      osc.frequency.setValueAtTime(high?740:340,soundContext.currentTime);
      gain.gain.setValueAtTime(.0001,soundContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.035,soundContext.currentTime+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,soundContext.currentTime+.11);
      osc.connect(gain).connect(soundContext.destination);
      osc.start();osc.stop(soundContext.currentTime+.12);
    } catch(_) { soundOn=false;soundButton.setAttribute("aria-pressed","false");soundButton.textContent="SOUND OFF"; }
  }
  soundButton.addEventListener("click",()=>{
    soundOn=!soundOn;
    soundButton.setAttribute("aria-pressed",String(soundOn));
    soundButton.textContent=soundOn?"SOUND ON":"SOUND OFF";
    if(soundOn)playSound(true);
  });
  function showOverlay(title, text) {
    overlayTitle.textContent = title; overlayCopy.textContent = text; overlay.hidden = false;
  }
  function stopClock() { cancelAnimationFrame(raf); raf = 0; clearTimeout(pauseTimer); }
  function updateControls() {
    const busy = mode === "starting" || mode === "saving";
    startButton.disabled = busy;
    startButton.textContent = busy ? (mode === "saving" ? "SAVING SCORE…" : "CONNECTING…")
      : pendingSave ? "RETRY SAVING SCORE"
      : !session?.user ? "SIGN IN WITH DISCORD"
      : mode === "playing" || mode === "paused" ? "RESTART ROUND" : "START ROUND";
    pauseButton.disabled = mode !== "playing" && mode !== "paused";
    pauseButton.textContent = mode === "paused" ? "RESUME" : "PAUSE";
    for (const element of elements.values()) element.disabled = mode !== "playing";
    shell.dataset.mode = mode;
  }
  function clearBoard() { targetLayer.replaceChildren(); elements.clear(); }
  function expire(message) {
    stopClock(); clearBoard(); mode = "expired"; pendingSave = null;
    showOverlay("ROUND EXPIRED", message); say(message + " Start a new round to try again."); updateControls();
  }
  function dispatch(type, fields = {}) {
    if (mode !== "playing" && type !== "resume") return false;
    const event = {type, ...fields, at:wallTime()};
    try { snapshot = engine.dispatch(event); events.push(event); return true; }
    catch (error) {
      if (type === "resume") expire("The two-minute pause allowance has ended.");
      else if (error.code === "pause_limit") say("The pause allowance has been used. This round is still running.");
      else if (error.code !== "card_already_open" && error.code !== "cards_blocked") say("Give it a moment, then try again.");
      return false;
    }
  }
  function takeAction(type, fields) {
    const previousResultAt = snapshot?.lastResult?.at;
    if (!dispatch(type, fields)) return;
    const result = snapshot.lastResult;
    if (memory && result?.at === previousResultAt) say("Card " + (fields.index + 1) + ": " + LABELS[snapshot.cards[fields.index].kind] + ". Find its pair.");
    else if (result?.type === "match"){
      say("Pair found! +" + result.points + " points. " + snapshot.matches + " of 6 pairs.");
      actionLabel.textContent="PAIR FOUND";
      actionDetail.textContent=snapshot.matches+" / 6 matched · "+snapshot.score+" points";
      playSound(true);
    }
    else if (result?.type === "mismatch"){
      say("Different gear. Remember those cards and try another pair.");
      actionLabel.textContent="NOT A MATCH";
      actionDetail.textContent="Remember the photographs and try the next pair.";
      playSound(false);
    }
    else if (memory) say("Card " + (fields.index + 1) + ": " + LABELS[snapshot.cards[fields.index].kind] + ". Find its pair.");
    else if (!memory && result){
      say(result.type.toUpperCase() + "! +" + result.points + " points.");
      actionLabel.textContent=result.type==="perfect"?"PERFECT TIMING":result.type.toUpperCase();
      actionDetail.textContent="+"+result.points+" points · "+snapshot.perfect+" perfect hits";
      playSound(result.type==="perfect");
    }
    render();
    if (snapshot.finished) finish();
  }
  function renderCards() {
    for (const card of snapshot.cards) {
      let element = elements.get(card.index);
      if (!element) {
        element = button("mini-card", ""); element.dataset.cardIndex = String(card.index);
        element.dataset.kind=card.kind;
        const back = node("span", "mini-card-back", "420"); back.setAttribute("aria-hidden","true");
        const front = node("span", "mini-card-front"); front.setAttribute("aria-hidden","true");
        front.append(art(card.kind), node("span", "mini-card-name", SHORT_LABELS[card.kind]));
        element.append(back, front);
        element.addEventListener("click", () => takeAction("flip", {index:card.index}));
        element.addEventListener("keydown", event => {
          const changes = {ArrowRight:1,ArrowLeft:-1,ArrowDown:4,ArrowUp:-4};
          let next;
          if (Object.hasOwn(changes, event.key)) next = (card.index + changes[event.key] + 12) % 12;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = 11;
          if (next !== undefined) { event.preventDefault(); elements.get(next)?.focus(); }
        });
        elements.set(card.index, element); targetLayer.append(element);
      }
      element.classList.toggle("is-open", card.faceUp);
      element.classList.toggle("is-matched", card.matched);
      element.setAttribute("aria-label", "Card " + (card.index + 1) + ": " + (card.faceUp ? LABELS[card.kind] : "face down") + (card.matched ? ", matched" : ""));
      element.setAttribute("aria-disabled", String(mode !== "playing" || card.matched || card.faceUp || snapshot.blockedUntil > snapshot.elapsedMs));
      element.disabled = mode !== "playing";
    }
  }
  function renderTargets() {
    const ids = new Set(snapshot.targets.map(target => target.id));
    for (const [id, element] of elements) if (!ids.has(id)) {
      if (document.activeElement === element) board.focus({preventScroll:true});
      element.remove(); elements.delete(id);
    }
    for (const target of snapshot.targets) {
      let element = elements.get(target.id);
      if (!element) {
        element = button("mini-target", ""); element.dataset.targetId = String(target.id);
        element.setAttribute("aria-label", "Blue glass hand pipe. Tap when the timing ring meets the green sweet spot.");
        element.append(node("span", "mini-sweet-ring"), node("span", "mini-approach-ring"), art("clean-glass"));
        element.style.left = target.x + "%"; element.style.top = target.y + "%";
        element.addEventListener("click", () => takeAction("hit", {id:target.id}));
        elements.set(target.id, element); targetLayer.append(element);
      }
      const phase = (snapshot.elapsedMs - target.spawnAt) / (target.sweetAt - target.spawnAt);
      element.style.setProperty("--ring-scale", String(Math.max(.45, 2.25 - phase * 1.25)));
      element.classList.toggle("is-perfect", Math.abs(snapshot.elapsedMs - target.sweetAt) <= 75);
      element.disabled = mode !== "playing";
    }
  }
  function render() {
    if (!snapshot) return;
    scoreLabel.textContent = String(snapshot.score).padStart(4,"0");
    timeLabel.textContent = String(Math.ceil(snapshot.remainingMs / 1000)).padStart(2,"0");
    statLabel.textContent = memory ? snapshot.matches + " / 6" : String(snapshot.perfect);
    const pct=Math.min(100,Math.max(0,Math.floor(snapshot.elapsedMs/config.durationMs*100)));
    progressFill.style.width=pct+"%";
    progress.setAttribute("aria-valuenow",String(pct));
    if(memory){
      shell.style.setProperty("--mini-pairs",String(snapshot.matches));
    }else{
      shell.style.setProperty("--mini-hit-rate",String(snapshot.hits));
    }
    if (memory) renderCards(); else renderTargets();
    updateControls();
  }
  async function saveScore() {
    if (!pendingSave || disposed) return;
    const current = generation;
    mode = "saving"; updateControls(); say("Checking your round and saving your score…");
    try {
      const saved = await saveAuthenticatedRun(run, session, pendingSave.events, pendingSave.elapsedMs, controller.signal);
      if (disposed || current !== generation) return;
      pendingSave = null; mode = "finished"; scoreLabel.textContent = String(saved.score).padStart(4,"0");
      const title = saved.isPersonalBest ? "NEW PERSONAL BEST!" : "ROUND COMPLETE.";
      showOverlay(title, saved.score + " points · personal best " + saved.best + ". Saved to your Discord profile.");
      say(saved.score + " points verified and saved. " + (saved.isPersonalBest ? "A new personal best! " : "") + "Your profile and leaderboard have been updated.");
      updateControls(); notifyScoreSaved(saved);
    } catch (error) {
      if (disposed || current !== generation) return;
      mode = "finished";
      const rejected = error.status >= 400 && error.status < 500 && ![408,429].includes(error.status);
      if (rejected) pendingSave = null;
      showOverlay(rejected ? "SCORE NOT SAVED" : "SAVE INTERRUPTED", error.message);
      say(error.message + (rejected ? " Start a new round to try again." : " Use Retry Saving Score to send this same round again."));
      updateControls();
    }
  }
  function finish() {
    if (mode !== "playing") return;
    stopClock();
    pendingSave = {events:events.slice(), elapsedMs:wallTime()};
    if (!memory) clearBoard();
    showOverlay("ROUND COMPLETE", "Checking your round and saving your score…");
    saveScore();
  }
  function frame() {
    if (disposed || mode !== "playing") return;
    try { snapshot = engine.advance(wallTime()); }
    catch (_) { expire("This round exceeded its allowed time."); return; }
    render();
    if (snapshot.finished) finish();
    else raf = requestAnimationFrame(frame);
  }
  function pause() {
    if (mode !== "playing" || !dispatch("pause")) return;
    mode = "paused"; stopClock();
    showOverlay("TAKE A BREATHER.", "Tap Resume within your two-minute total pause allowance.");
    say("Round paused. Your total pause allowance is two minutes.");
    pauseTimer = setTimeout(() => expire("The two-minute pause allowance has ended."), Math.max(1, LIMITS.maxPauseMs - snapshot.pausedMs));
    render();
  }
  function resume() {
    if (mode !== "paused" || document.hidden || !dispatch("resume")) return;
    clearTimeout(pauseTimer); mode = "playing"; overlay.hidden = true;
    say("Round resumed."); render(); board.focus({preventScroll:true}); raf = requestAnimationFrame(frame);
  }
  async function start() {
    if (disposed || mode === "starting" || mode === "saving") return;
    if (!session?.user) { window.location.assign("/auth/discord"); return; }
    if (pendingSave) { await saveScore(); return; }
    generation++; const current = generation;
    stopClock(); clearBoard(); mode = "starting"; updateControls();
    showOverlay("CONNECTING…", "Checking your Discord session and preparing a ranked round."); say("Preparing your round…");
    try {
      const authorized = await startAuthenticatedRun(gameId, controller.signal);
      if (disposed || current !== generation) return;
      session = authorized.session; run = authorized.run;
      engine = createEngine(gameId, run.seed); snapshot = engine.snapshot();
      started = performance.now(); lastWallMs = 0; events = []; mode = "playing"; overlay.hidden = true;
      actionLabel.textContent=memory?"FIND SIX PAIRS":"WAIT FOR THE GREEN ZONE";
      actionDetail.textContent=memory?"The six photographs are different items.":"Perfect timing earns the strongest hit.";
      render(); say("Round started. " + (memory ? "Find all six pairs!" : "Tap when the rings meet!"));
      if (memory) elements.get(0)?.focus({preventScroll:true}); else board.focus({preventScroll:true});
      raf = requestAnimationFrame(frame);
    } catch (error) {
      if (disposed || current !== generation) return;
      mode = "idle";
      if (error.code === "login_required") session = {user:null};
      showOverlay("CONNECTION NEEDED", error.message); say(error.message); updateControls();
    }
  }
  const onVisibility = () => { if (document.hidden) pause(); };
  const onPageHide = () => pause();
  startButton.addEventListener("click", start);
  pauseButton.addEventListener("click", () => mode === "paused" ? resume() : pause());
  board.addEventListener("keydown", event => {
    if (!memory && event.target === board && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      if (mode === "playing" && snapshot.targets.length) takeAction("hit", {id:snapshot.targets[0].id});
    }
  });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  if (!session?.user) {
    showOverlay("DISCORD REQUIRED", "Sign in securely with Discord to play and save your scores.");
    say("Sign in with Discord before playing.");
  }
  updateControls();
  return () => {
    disposed = true; generation++; stopClock(); controller.abort();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    clearBoard();
  };
}
