import {createEngine, GAME_CONFIG, LIMITS} from "/shared/arcade-rules.mjs";
import {startAuthenticatedRun, saveAuthenticatedRun, notifyScoreSaved} from "/arcade-api.js";

const LABELS = {
  lighter:"Lighter", grinder:"Grinder", papers:"Rolling papers",
  "clean-glass":"Glass piece", leaf:"Cannabis leaf", bong:"Purple bong"
};
const SHORT_LABELS = {lighter:"LIGHTER",grinder:"GRINDER",papers:"PAPERS","clean-glass":"GLASS",leaf:"LEAF",bong:"BONG"};
const SVG_NS = "http://www.w3.org/2000/svg";
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
  if (kind === "leaf") {
    const image = node("img", "mini-art mini-leaf");
    image.src = "/assets/approved-leaf.svg"; image.alt = ""; return image;
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "mini-art"); svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("aria-hidden", "true");
  if (kind === "bong") {
    for (const [d, fill, width] of [
      ["M43 9h18v43l19 24q9 16-12 16H31Q11 92 21 77l22-25Z", "#9d65e7", "3"],
      ["M29 72h42l9 13H21Z", "#c4fc92", "2"],
      ["M61 56l17-15 9 9-20 18M40 9h24M49 18v34", "none", "5"]
    ]) {
      const path = document.createElementNS(SVG_NS,"path");
      path.setAttribute("d", d); path.setAttribute("fill", fill); path.setAttribute("stroke", "#e8d9ff");
      path.setAttribute("stroke-width", width); path.setAttribute("stroke-linecap", "round");
      svg.append(path);
    }
  } else {
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "/assets/sesh-gear.svg#" + kind); svg.append(use);
  }
  return svg;
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
    : "Wait for the shrinking purple ring to meet the green ring, then tap the glass. Perfect timing earns the biggest score.");
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
  controls.append(startButton, pauseButton);
  const status = node("p", "mini-status", "Signed in as " + (initialSession?.user?.username || "guest") + ".");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const keyboard = node("p", "mini-keyboard", memory
    ? "Touch or click a card. Keyboard: Tab and Enter, or arrow keys to move between cards."
    : "Touch or click the glass. Keyboard: focus the board and press Space or Enter when the rings meet.");
  const pauseNote = node("p", "mini-pause-note", "Pause anytime · up to 2 minutes total per round. Scores are checked by the server.");
  shell.append(header, hud, board, controls, status, keyboard, pauseNote);
  container.replaceChildren(shell);

  let engine, snapshot, session = initialSession, run, started = 0, events = [];
  let mode = "idle", raf = 0, pauseTimer = 0, disposed = false, pendingSave = null;
  let generation = 0;
  const controller = new AbortController(), elements = new Map();
  const wallTime = () => Math.max(0, Math.floor(performance.now() - started));
  const say = text => { status.textContent = text; };
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
    else if (result?.type === "match") say("Pair found! +" + result.points + " points. " + snapshot.matches + " of 6 pairs.");
    else if (result?.type === "mismatch") say("Different gear. Remember those cards and try another pair.");
    else if (memory) say("Card " + (fields.index + 1) + ": " + LABELS[snapshot.cards[fields.index].kind] + ". Find its pair.");
    else if (!memory && result) say(result.type.toUpperCase() + "! +" + result.points + " points.");
    render();
    if (snapshot.finished) finish();
  }
  function renderCards() {
    for (const card of snapshot.cards) {
      let element = elements.get(card.index);
      if (!element) {
        element = button("mini-card", ""); element.dataset.cardIndex = String(card.index);
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
        element.setAttribute("aria-label", "Glass piece. Tap when the purple ring meets the green ring.");
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
    catch (error) { console.warn("Arcade timing failure", error?.code || error?.message || "unknown"); expire("This round exceeded its allowed time."); return; }
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
      started = performance.now(); events = []; mode = "playing"; overlay.hidden = true;
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
