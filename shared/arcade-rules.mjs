/**
 * The 420 Lobby ranked arcade rules. This module runs unchanged in browsers,
 * Node, and Cloudflare Workers. A server-issued seed and an input replay are the
 * only score inputs. Client-rendered totals are never authoritative.
 *
 * Input timestamps are integer wall milliseconds since the local run began.
 * Schedule timestamps and snapshot.elapsedMs are ACTIVE game milliseconds.
 * Pauses stop active time, and are included in the signed-in run's replay.
 * Deterministic replay rejects impossible inputs; it cannot identify every bot.
 */
export const RULES_VERSION = "1";
export const GAME_IDS = Object.freeze(["sesh-signal", "green-room-match", "bong-blitz"]);
export const GAME_CONFIG = Object.freeze({
  "sesh-signal": Object.freeze({id: "sesh-signal", title: "Sesh Signal", durationMs: 42000,
    description: "Collect your sesh kit, dodge broken glass, and charge Chill Mode."}),
  "green-room-match": Object.freeze({id: "green-room-match", title: "Green Room Match", durationMs: 45000,
    description: "Remember twelve cards and reunite six pairs before time runs out."}),
  "bong-blitz": Object.freeze({id: "bong-blitz", title: "Bong Blitz", durationMs: 30000,
    description: "Tap each glass piece as its ring reaches the perfect timing zone."})
});
export const ACHIEVEMENTS = Object.freeze([
  {id: "first-spark", title: "First Spark", description: "Finish your first ranked round.", icon: "✦"},
  {id: "sesh-starter", title: "Sesh Starter", description: "Collect ten items in Sesh Signal.", icon: "🔥"},
  {id: "full-kit", title: "Fully Equipped", description: "Complete a lighter, grinder, and papers kit.", icon: "✧"},
  {id: "chill-seeker", title: "Chill Seeker", description: "Activate Chill Mode in Sesh Signal.", icon: "❄"},
  {id: "clean-session", title: "Clean Session", description: "Collect fifteen items without touching broken glass.", icon: "◇"},
  {id: "matchmaker", title: "Matchmaker", description: "Find all six Green Room pairs.", icon: "♧"},
  {id: "perfect-memory", title: "High Recall", description: "Clear Green Room Match without a mismatch.", icon: "✿"},
  {id: "bowl-control", title: "Bowl Control", description: "Hit ten Bong Blitz targets in one round.", icon: "◎"},
  {id: "perfect-timing", title: "Perfect Timing", description: "Land five perfect Bong Blitz hits.", icon: "◉"},
  {id: "lobby-legend", title: "Lobby Legend", description: "Score 700 points in Sesh Signal.", icon: "♛"}
].map(Object.freeze));

export const LIMITS = Object.freeze({maxEvents: 512, maxPauses: 10, maxPauseMs: 120000,
  minActionMs: 50, minReactionMs: 80, pairFlipMs: 100, mismatchMs: 650,
  finishGraceMs: 5000, maxRunWallMs: 900000});
const SAFE_GEAR = ["lighter", "grinder", "papers"];
const CARD_KINDS = [...SAFE_GEAR, "clean-glass", "leaf", "bong"];
const HAZARDS = new Set(["broken-bong", "broken-pipe"]);

export class RuleError extends Error {
  constructor(code) { super(`Invalid arcade replay: ${code}`); this.name = "RuleError"; this.code = code; }
}
const requireRule = (condition, code) => { if (!condition) throw new RuleError(code); };
const isMs = value => Number.isSafeInteger(value) && value >= 0 && value <= LIMITS.maxRunWallMs;

// FNV-style string hashing followed by Mulberry32. No browser entropy or time is
// consulted after the server has created the seed.
function seededRandom(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return () => {
    hash |= 0; hash = hash + 0x6D2B79F5 | 0;
    let value = Math.imul(hash ^ hash >>> 15, 1 | hash);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function createGame(gameId, seed) {
  requireRule(GAME_IDS.includes(gameId), "unknown_game");
  requireRule(typeof seed === "string" && seed.length > 0 && seed.length <= 256, "invalid_seed");
  const random = seededRandom(`${RULES_VERSION}:${gameId}:${seed}`);
  const range = (min, max) => min + random() * (max - min);
  const game = {gameId, rulesVersion: RULES_VERSION, ...GAME_CONFIG[gameId]};
  if (gameId === "green-room-match") {
    const deck = [...CARD_KINDS, ...CARD_KINDS];
    for (let index = deck.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [deck[index], deck[other]] = [deck[other], deck[index]];
    }
    game.deck = Object.freeze(deck);
  } else {
    const targets = [];
    for (let spawnAt = gameId === "sesh-signal" ? 250 : 400; spawnAt < game.durationMs - 1100;) {
      const pick = random();
      const kind = gameId === "bong-blitz" ? "clean-glass" :
        pick < .12 ? "broken-bong" : pick < .23 ? "broken-pipe" :
        pick < .47 ? "lighter" : pick < .70 ? "grinder" : pick < .90 ? "papers" : "clean-glass";
      let x = range(16, 84), y = range(17, 82);
      for (let attempt = 0; attempt < 12 && targets.some(target =>
        target.expiresAt > spawnAt && Math.hypot(target.x - x, target.y - y) < 21); attempt++) {
        x = range(16, 84); y = range(17, 82);
      }
      const life = gameId === "sesh-signal" ? Math.round(3200 - spawnAt / game.durationMs * 800) : 1050;
      const target = {id: targets.length + 1, kind, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)),
        spawnAt, life, expiresAt: spawnAt + life};
      if (gameId === "bong-blitz") target.sweetAt = spawnAt + Math.round(range(620, 760));
      targets.push(Object.freeze(target));
      spawnAt += gameId === "sesh-signal" ?
        Math.round((920 - Math.min(260, spawnAt / game.durationMs * 260)) * range(.78, 1.17)) : 1200;
    }
    game.targets = Object.freeze(targets);
  }
  return Object.freeze(game);
}

export function createEngine(gameId, seed) {
  const game = createGame(gameId, seed);
  const state = {score: 0, combo: 0, maxCombo: 0, charge: 0, boostUntil: 0,
    caught: 0, avoided: 0, hazardsCaught: 0, kits: 0, boosts: 0, kit: [],
    hits: 0, perfect: 0, misses: 0, flips: 0, matches: 0, mistakes: 0,
    streak: 0, selected: [], matched: new Set(), blockedUntil: 0,
    elapsedMs: 0, wallElapsedMs: 0, pausedMs: 0, pauseAt: null, pauses: 0,
    finished: false, endedAt: null, lastActionAt: -Infinity, eventCount: 0,
    scoringActions: 0, nextTarget: 0, targets: new Map(), lastResult: null};

  function expireTargets(at) {
    // A target's expiry can be extended by Chill Mode, so map insertion order
    // is not necessarily expiry order. Any safe miss resets the combo.
    for (const [id, target] of state.targets) {
      if (target.expiresAt > at) continue;
      state.targets.delete(id);
      if (gameId === "sesh-signal") {
        if (HAZARDS.has(target.kind)) state.avoided++;
        else state.combo = 0;
      } else { state.misses++; state.combo = 0; }
    }
  }

  function advance(wallMs) {
    requireRule(isMs(wallMs) && wallMs >= state.wallElapsedMs, "invalid_time");
    if (state.pauseAt !== null) {
      requireRule(state.pausedMs + wallMs - state.pauseAt <= LIMITS.maxPauseMs, "pause_limit");
      state.wallElapsedMs = wallMs;
      return snapshot();
    }
    const nextActive = Math.min(game.durationMs, state.elapsedMs + wallMs - state.wallElapsedMs);
    if (!state.finished) {
      if (game.targets) {
        while (state.nextTarget < game.targets.length && game.targets[state.nextTarget].spawnAt <= nextActive) {
          const scheduled = game.targets[state.nextTarget++];
          expireTargets(scheduled.spawnAt);
          const life = gameId === "sesh-signal" && scheduled.spawnAt < state.boostUntil ?
            Math.round(scheduled.life * 1.4) : scheduled.life;
          state.targets.set(scheduled.id, {...scheduled, life, expiresAt: scheduled.spawnAt + life});
        }
        expireTargets(nextActive);
      }
      if (gameId === "green-room-match" && state.blockedUntil && nextActive >= state.blockedUntil) {
        state.selected = []; state.blockedUntil = 0;
      }
      if (nextActive >= game.durationMs) {
        state.finished = true;
        state.endedAt = state.wallElapsedMs + game.durationMs - state.elapsedMs;
        state.targets.clear();
      }
      state.elapsedMs = nextActive;
    }
    state.wallElapsedMs = wallMs;
    return snapshot();
  }

  function snapshot() {
    const openPause = state.pauseAt === null ? 0 : state.wallElapsedMs - state.pauseAt;
    const output = {gameId, rulesVersion: RULES_VERSION, durationMs: game.durationMs,
      elapsedMs: state.elapsedMs, wallElapsedMs: state.wallElapsedMs,
      remainingMs: Math.max(0, game.durationMs - state.elapsedMs),
      pausedMs: state.pausedMs + openPause, paused: state.pauseAt !== null,
      finished: state.finished, endedAt: state.endedAt, score: state.score,
      combo: state.combo, maxCombo: state.maxCombo, lastResult: state.lastResult ? {...state.lastResult} : null};
    if (gameId === "sesh-signal") Object.assign(output, {
      charge: state.charge, boostUntil: state.boostUntil,
      boostMs: Math.max(0, state.boostUntil - state.elapsedMs), kit: [...state.kit],
      caught: state.caught, avoided: state.avoided, hazardsCaught: state.hazardsCaught,
      kits: state.kits, boosts: state.boosts,
      targets: [...state.targets.values()].map(target => ({...target}))
    });
    else if (gameId === "bong-blitz") Object.assign(output, {
      hits: state.hits, perfect: state.perfect, misses: state.misses,
      targets: [...state.targets.values()].map(target => ({...target}))
    });
    else Object.assign(output, {
      flips: state.flips, matches: state.matches, mistakes: state.mistakes,
      blockedUntil: state.blockedUntil,
      cards: game.deck.map((kind, index) => ({index, kind,
        matched: state.matched.has(index), faceUp: state.matched.has(index) || state.selected.includes(index)}))
    });
    return output;
  }

  function checkEvent(event) {
    requireRule(event && typeof event === "object" && !Array.isArray(event), "invalid_event");
    const allowed = {catch: ["id"], hit: ["id"], flip: ["index"], boost: [], pause: [], resume: []};
    requireRule(Object.hasOwn(allowed, event.type), "unknown_action");
    const keys = ["type", "at", ...allowed[event.type]];
    requireRule(Object.keys(event).length === keys.length &&
      Object.keys(event).every(key => keys.includes(key)), "invalid_event_fields");
    requireRule(isMs(event.at) && event.at >= state.wallElapsedMs, "invalid_time");
    requireRule(state.eventCount < LIMITS.maxEvents, "event_limit");
  }

  function dispatch(event) {
    checkEvent(event);
    advance(event.at);
    requireRule(!state.finished, "run_finished");
    if (event.type === "resume") {
      requireRule(state.pauseAt !== null, "not_paused");
      state.pausedMs += event.at - state.pauseAt;
      state.pauseAt = null;
    } else if (event.type === "pause") {
      requireRule(state.pauseAt === null, "already_paused");
      requireRule(state.pauses < LIMITS.maxPauses, "pause_limit");
      state.pauseAt = event.at; state.pauses++;
    } else {
      requireRule(state.pauseAt === null, "input_while_paused");
      const at = state.elapsedMs;
      if (event.type === "boost") {
        requireRule(gameId === "sesh-signal", "wrong_game_action");
        requireRule(state.charge >= 100 && at >= state.boostUntil, "boost_not_ready");
        state.charge = 0; state.boostUntil = at + 5000; state.boosts++;
        state.lastResult = {type: "boost", points: 0, at};
      } else {
        requireRule(at - state.lastActionAt >= LIMITS.minActionMs, "actions_too_fast");
        const maxActions = gameId === "green-room-match" ? 240 : game.targets.length;
        requireRule(state.scoringActions < maxActions, "action_limit");
        if (event.type === "flip") {
          requireRule(gameId === "green-room-match", "wrong_game_action");
          requireRule(Number.isInteger(event.index) && event.index >= 0 && event.index < game.deck.length, "invalid_card");
          requireRule(at >= LIMITS.minReactionMs, "reaction_too_fast");
          requireRule(!state.blockedUntil, "cards_blocked");
          requireRule(!state.matched.has(event.index) && !state.selected.includes(event.index), "card_already_open");
          requireRule(state.selected.length === 0 || at - state.lastActionAt >= LIMITS.pairFlipMs, "pair_too_fast");
          state.flips++; state.selected.push(event.index);
          if (state.selected.length === 2) {
            if (game.deck[state.selected[0]] === game.deck[state.selected[1]]) {
              state.matches++; state.streak++; state.combo = state.streak;
              const points = 100 + Math.max(0, 100 - Math.floor(at / 500)) + state.streak * 10;
              state.score += points;
              state.selected.forEach(index => state.matched.add(index)); state.selected = [];
              state.lastResult = {type: "match", points, at};
              if (state.matches === 6) { state.finished = true; state.endedAt = event.at; }
            } else {
              state.mistakes++; state.streak = 0; state.combo = 0;
              state.blockedUntil = at + LIMITS.mismatchMs;
              state.lastResult = {type: "mismatch", points: 0, at};
            }
          }
        } else {
          requireRule(event.type === (gameId === "sesh-signal" ? "catch" : "hit") &&
            gameId !== "green-room-match", "wrong_game_action");
          requireRule(Number.isInteger(event.id), "invalid_target");
          const target = state.targets.get(event.id);
          requireRule(Boolean(target), "target_not_active");
          requireRule(at - target.spawnAt >= LIMITS.minReactionMs, "reaction_too_fast");
          let points;
          if (gameId === "sesh-signal") {
            if (HAZARDS.has(target.kind)) {
              points = -Math.min(20, state.score); state.score += points;
              state.combo = 0; state.kit = []; state.hazardsCaught++;
            } else {
              const multiplier = at < state.boostUntil ? 2 : 1;
              const rare = target.kind === "clean-glass";
              state.combo++; state.caught++;
              points = (rare ? 45 : 10 + Math.min(state.combo, 10) * 2) * multiplier;
              if (multiplier === 1) state.charge = Math.min(100, state.charge + (rare ? 40 : 20));
              if (SAFE_GEAR.includes(target.kind) && !state.kit.includes(target.kind)) {
                state.kit.push(target.kind);
                if (state.kit.length === SAFE_GEAR.length) {
                  points += 75 * multiplier; state.kits++; state.kit = [];
                  state.charge = Math.min(100, state.charge + 30);
                }
              }
              state.score += points;
            }
            state.lastResult = {type: HAZARDS.has(target.kind) ? "hazard" : "catch", points, id: target.id, at};
          } else {
            const offset = at - target.sweetAt, accuracy = Math.abs(offset);
            const quality = accuracy <= 75 ? "perfect" : accuracy <= 160 ? "nice" : offset < 0 ? "early" : "late";
            state.hits++; state.combo++;
            if (quality === "perfect") state.perfect++;
            points = (accuracy <= 75 ? 100 : accuracy <= 160 ? 70 : accuracy <= 260 ? 40 : 10) + Math.min(10, state.combo) * 2;
            state.score += points;
            state.lastResult = {type: quality, points, id: target.id, at};
          }
          state.targets.delete(event.id);
        }
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.lastActionAt = at; state.scoringActions++;
      }
    }
    state.eventCount++;
    return snapshot();
  }
  return Object.freeze({game, advance, dispatch, snapshot});
}

export function validateRun(gameId, seed, events, options = {}) {
  requireRule(Array.isArray(events) && events.length <= LIMITS.maxEvents, "invalid_events");
  requireRule(isMs(options.elapsedMs), "invalid_elapsed_time");
  requireRule(isMs(options.wallElapsedMs), "invalid_server_time");
  // A small clock-resolution allowance never replaces the server's clock.
  requireRule(options.elapsedMs <= options.wallElapsedMs + 250, "round_too_fast");
  requireRule(events.every(event => event && isMs(event.at) && event.at <= options.elapsedMs), "event_after_finish");
  const engine = createEngine(gameId, seed);
  for (const event of events) engine.dispatch(event);
  const result = engine.advance(options.elapsedMs);
  requireRule(!result.paused, "unfinished_pause");
  requireRule(result.finished, "round_incomplete");
  requireRule(options.elapsedMs - result.endedAt <= LIMITS.finishGraceMs, "finish_too_late");
  requireRule(options.wallElapsedMs <= LIMITS.maxRunWallMs, "run_expired");
  const stats = gameId === "sesh-signal" ?
    {caught: result.caught, avoided: result.avoided, hazardsCaught: result.hazardsCaught,
      kits: result.kits, boosts: result.boosts, maxCombo: result.maxCombo} : gameId === "green-room-match" ?
    {flips: result.flips, matches: result.matches, mistakes: result.mistakes, maxCombo: result.maxCombo} :
    {hits: result.hits, perfect: result.perfect, misses: result.misses, maxCombo: result.maxCombo};
  const achievements = ["first-spark"];
  if (gameId === "sesh-signal") {
    if (result.caught >= 10) achievements.push("sesh-starter");
    if (result.kits) achievements.push("full-kit");
    if (result.boosts) achievements.push("chill-seeker");
    if (result.caught >= 15 && result.hazardsCaught === 0) achievements.push("clean-session");
    if (result.score >= 700) achievements.push("lobby-legend");
  } else if (gameId === "green-room-match") {
    if (result.matches === 6) achievements.push("matchmaker");
    if (result.matches === 6 && !result.mistakes) achievements.push("perfect-memory");
  } else {
    if (result.hits >= 10) achievements.push("bowl-control");
    if (result.perfect >= 5) achievements.push("perfect-timing");
  }
  return {score: result.score, stats, achievements, rulesVersion: RULES_VERSION,
    durationMs: result.elapsedMs, elapsedMs: options.elapsedMs, pausedMs: result.pausedMs};
}
