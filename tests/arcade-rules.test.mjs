import test from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVEMENTS, GAME_CONFIG, GAME_IDS, LIMITS, RULES_VERSION,
  RuleError, createEngine, createGame, validateRun
} from "../shared/arcade-rules.mjs";

const SEED = "test-seed";
const invalid = code => error => error instanceof RuleError && error.code === code;
const validate = (id, events = [], elapsedMs = GAME_CONFIG[id].durationMs, wallElapsedMs = elapsedMs + 100) =>
  validateRun(id, SEED, events, {elapsedMs, wallElapsedMs});

function perfectMemoryEvents() {
  const {deck} = createGame("green-room-match", SEED);
  const pairs = new Map();
  deck.forEach((kind, index) => pairs.set(kind, [...(pairs.get(kind) || []), index]));
  return [...pairs.values()].flat().map((index, offset) => ({type: "flip", index, at: 200 + offset * 150}));
}

function cleanSeshEvents() {
  const engine = createEngine("sesh-signal", SEED), events = [];
  for (const target of engine.game.targets) {
    if (target.kind.startsWith("broken")) continue;
    const event = {type: "catch", id: target.id, at: target.spawnAt + 100};
    engine.dispatch(event); events.push(event);
    if (engine.snapshot().charge === 100 && engine.snapshot().boostMs === 0) {
      const boost = {type: "boost", at: event.at + 1};
      engine.dispatch(boost); events.push(boost);
    }
  }
  return {engine, events};
}

test("public rules catalog has three games and stable unique achievement IDs", () => {
  assert.equal(RULES_VERSION, "1");
  assert.equal(GAME_IDS.length, 3);
  assert.equal(new Set(ACHIEVEMENTS.map(achievement => achievement.id)).size, ACHIEVEMENTS.length);
  for (const id of GAME_IDS) assert.ok(GAME_CONFIG[id].durationMs >= 30000);
});

test("server seed recreates identical schedules and distinct seeds change them", () => {
  for (const id of GAME_IDS) {
    assert.deepEqual(createGame(id, SEED), createGame(id, SEED));
    assert.notDeepEqual(createGame(id, SEED), createGame(id, "another-server-seed"));
  }
  const game = createGame("sesh-signal", SEED);
  assert.equal(game.targets[0].kind, "papers");
  assert.equal(game.targets[0].spawnAt, 250);
  assert.ok(game.targets.every(target => target.x >= 16 && target.x <= 84 && target.y >= 17 && target.y <= 82));
  assert.ok(Object.isFrozen(game.targets));
});

test("memory deck always contains six pairs", () => {
  const {deck} = createGame("green-room-match", SEED);
  assert.equal(deck.length, 12);
  for (const kind of new Set(deck)) assert.equal(deck.filter(card => card === kind).length, 2);
  assert.equal(new Set(deck).size, 6);
});

test("Sesh retains combo, rare glass, gear kit, hazard penalty, and earned Chill Mode", () => {
  const engine = createEngine("sesh-signal", SEED);
  engine.dispatch({type: "catch", id: 1, at: 350});
  assert.equal(engine.snapshot().score, 12);
  assert.deepEqual(engine.snapshot().kit, ["papers"]);
  engine.dispatch({type: "catch", id: 2, at: 1107});
  assert.equal(engine.snapshot().score, 0); // Penalties never make a negative score.
  assert.equal(engine.snapshot().combo, 0);
  assert.deepEqual(engine.snapshot().kit, []);
  assert.equal(engine.snapshot().hazardsCaught, 1);
  engine.dispatch({type: "catch", id: 3, at: 2044});
  assert.equal(engine.snapshot().score, 45);
  const {engine: clean, events} = cleanSeshEvents();
  const result = validate("sesh-signal", events);
  assert.equal(result.score, clean.snapshot().score);
  assert.ok(result.stats.kits > 0);
  assert.ok(result.stats.boosts > 0);
  assert.ok(result.achievements.includes("full-kit"));
  assert.ok(result.achievements.includes("chill-seeker"));
  assert.ok(result.achievements.includes("clean-session"));
  assert.ok(result.stats.avoided > 0);
});

test("missing a safe Sesh item resets combo, while avoiding broken glass increments avoided", () => {
  const engine = createEngine("sesh-signal", SEED);
  engine.dispatch({type: "catch", id: 1, at: 350});
  assert.equal(engine.snapshot().combo, 1);
  engine.advance(4300);
  assert.equal(engine.snapshot().combo, 1);
  assert.equal(engine.snapshot().avoided, 1);
  engine.advance(5200);
  assert.equal(engine.snapshot().combo, 0);
});

test("Chill Mode extends newly spawned target life and doubles points", () => {
  const engine = createEngine("sesh-signal", SEED);
  for (const [id, at] of [[1, 350], [3, 2044], [4, 2830]]) engine.dispatch({type: "catch", id, at});
  assert.equal(engine.snapshot().charge, 100);
  engine.dispatch({type: "boost", at: 2831});
  engine.advance(3636);
  const target = engine.snapshot().targets.find(item => item.id === 5);
  assert.equal(target.life, Math.round(engine.game.targets[4].life * 1.4));
  const before = engine.snapshot().score;
  engine.dispatch({type: "catch", id: 5, at: 3636});
  assert.equal(engine.snapshot().score - before, 36); // Fourth safe catch: (10 + 4*2)*2.
});

test("Bong Blitz computes timing points on the server and tracks missed targets", () => {
  const game = createGame("bong-blitz", SEED);
  const events = game.targets.map(target => ({type: "hit", id: target.id, at: target.sweetAt}));
  const result = validate("bong-blitz", events);
  const expected = game.targets.reduce((sum, target, index) => sum + 100 + Math.min(10, index + 1) * 2, 0);
  assert.equal(result.score, expected);
  assert.equal(result.stats.perfect, game.targets.length);
  assert.equal(result.stats.misses, 0);
  assert.ok(result.achievements.includes("perfect-timing"));
  const skipped = validate("bong-blitz");
  assert.equal(skipped.score, 0);
  assert.equal(skipped.stats.misses, game.targets.length);
});

test("Green Room Match can finish early with server-computed match and speed bonuses", () => {
  const events = perfectMemoryEvents();
  const end = events.at(-1).at;
  const result = validate("green-room-match", events, end);
  const expected = events.filter((event, index) => index % 2).reduce((sum, event, index) =>
    sum + 100 + Math.max(0, 100 - Math.floor(event.at / 500)) + (index + 1) * 10, 0);
  assert.equal(result.score, expected);
  assert.equal(result.durationMs, end);
  assert.equal(result.stats.matches, 6);
  assert.deepEqual(result.achievements, ["first-spark", "matchmaker", "perfect-memory"]);
});

test("memory mismatches block new flips, then hide both cards after 650ms", () => {
  const engine = createEngine("green-room-match", SEED);
  engine.dispatch({type: "flip", index: 0, at: 200});
  engine.dispatch({type: "flip", index: 1, at: 400});
  assert.equal(engine.snapshot().mistakes, 1);
  assert.equal(engine.snapshot().cards.filter(card => card.faceUp).length, 2);
  assert.throws(() => engine.dispatch({type: "flip", index: 3, at: 600}), invalid("cards_blocked"));
  engine.advance(1050);
  assert.equal(engine.snapshot().cards.filter(card => card.faceUp).length, 0);
  engine.dispatch({type: "flip", index: 3, at: 1050});
  assert.equal(engine.snapshot().cards[3].faceUp, true);
});

test("pause/resume uses wall timestamps, freezes active clock, and validates real total duration", () => {
  const target = createGame("bong-blitz", SEED).targets[0];
  const events = [{type: "pause", at: 500}, {type: "resume", at: 5500},
    {type: "hit", id: target.id, at: target.sweetAt + 5000}];
  const result = validate("bong-blitz", events, 35000, 35200);
  assert.equal(result.pausedMs, 5000);
  assert.equal(result.durationMs, 30000);
  assert.equal(result.stats.perfect, 1);
  assert.throws(() => validate("bong-blitz", events, 35000, 30000), invalid("round_too_fast"));
});

test("frame frequency never changes deterministic scoring or target lifetimes", () => {
  const {events} = cleanSeshEvents();
  const engine = createEngine("sesh-signal", SEED);
  let nextFrame = 17;
  for (const event of events) {
    while (nextFrame < event.at) { engine.advance(nextFrame); nextFrame += 17; }
    engine.dispatch(event);
  }
  engine.advance(42000);
  const replay = validate("sesh-signal", events);
  assert.equal(replay.score, engine.snapshot().score);
  assert.equal(replay.stats.maxCombo, engine.snapshot().maxCombo);
  assert.equal(replay.stats.avoided, engine.snapshot().avoided);
});

test("replay rejects fabricated score fields, unknown action types, and wrong game actions", () => {
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: 350, score: 999999}]), invalid("invalid_event_fields"));
  assert.throws(() => validate("sesh-signal", [{type: "award", at: 350}]), invalid("unknown_action"));
  assert.throws(() => validate("sesh-signal", [{type: "hit", id: 1, at: 350}]), invalid("wrong_game_action"));
  assert.throws(() => validate("bong-blitz", [{type: "flip", index: 1, at: 350}]), invalid("wrong_game_action"));
});

test("replay rejects duplicate targets, future/expired targets, and impossible reaction times", () => {
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: 350}, {type: "catch", id: 1, at: 450}]), invalid("target_not_active"));
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: 200}]), invalid("target_not_active"));
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: 3445}]), invalid("target_not_active"));
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: 251}]), invalid("reaction_too_fast"));
});

test("replay rejects too-fast inputs, repeated cards, and unearned boost", () => {
  const game = createGame("green-room-match", SEED);
  const pair = game.deck.findIndex((kind, index) => index > 0 && kind === game.deck[0]);
  assert.throws(() => validate("green-room-match", [{type: "flip", index: 0, at: 200}, {type: "flip", index: pair, at: 220}]), invalid("actions_too_fast"));
  assert.throws(() => validate("green-room-match", [{type: "flip", index: 0, at: 200}, {type: "flip", index: pair, at: 270}]), invalid("pair_too_fast"));
  assert.throws(() => validate("green-room-match", [{type: "flip", index: 0, at: 200}, {type: "flip", index: 0, at: 400}]), invalid("card_already_open"));
  assert.throws(() => validate("sesh-signal", [{type: "boost", at: 1000}]), invalid("boost_not_ready"));
});

test("replay rejects fractional, reversed, after-finish, and non-finite timestamps", () => {
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: 350.5}]), invalid("event_after_finish"));
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: Infinity}]), invalid("event_after_finish"));
  assert.throws(() => validate("sesh-signal", [{type: "catch", id: 1, at: 350}, {type: "pause", at: 300}]), invalid("invalid_time"));
  assert.throws(() => validate("bong-blitz", [{type: "pause", at: 30001}]), invalid("event_after_finish"));
});

test("ranked finish requires complete active duration and rejects delayed/overspeed submissions", () => {
  assert.throws(() => validate("sesh-signal", [], 41999), invalid("round_incomplete"));
  assert.throws(() => validate("sesh-signal", [], 42000, 100), invalid("round_too_fast"));
  assert.throws(() => validate("sesh-signal", [], 42000 + LIMITS.finishGraceMs + 1), invalid("finish_too_late"));
  assert.throws(() => validateRun("sesh-signal", SEED, [], {elapsedMs: 42000}), invalid("invalid_server_time"));
});

test("ranked replay rejects an unfinished pause and input while paused", () => {
  assert.throws(() => validate("bong-blitz", [{type: "pause", at: 1000}], 30000), invalid("unfinished_pause"));
  assert.throws(() => validate("bong-blitz", [{type: "pause", at: 500}, {type: "hit", id: 1, at: 1127}]), invalid("input_while_paused"));
  assert.throws(() => validate("bong-blitz", [{type: "resume", at: 1000}]), invalid("not_paused"));
  assert.throws(() => validate("bong-blitz", [{type: "pause", at: 1000}, {type: "pause", at: 2000}]), invalid("already_paused"));
});

test("pause count, pause length, and replay length are bounded", () => {
  const tooManyPauses = Array.from({length: 11}, (_, index) =>
    [{type: "pause", at: index * 200 + 100}, {type: "resume", at: index * 200 + 200}]).flat();
  assert.throws(() => validate("bong-blitz", tooManyPauses, 31100), invalid("pause_limit"));
  assert.throws(() => validate("bong-blitz", [{type: "pause", at: 500}, {type: "resume", at: 120501}], 150001), invalid("pause_limit"));
  assert.throws(() => validate("bong-blitz", Array.from({length: 513}, () => ({type: "hit", id: 1, at: 1000}))), invalid("invalid_events"));
});

test("unknown games, missing seeds, invalid card indices and malformed events fail closed", () => {
  assert.throws(() => createGame("fake-game", SEED), invalid("unknown_game"));
  assert.throws(() => createGame("sesh-signal", ""), invalid("invalid_seed"));
  assert.throws(() => validate("green-room-match", [{type: "flip", index: 12, at: 200}]), invalid("invalid_card"));
  assert.throws(() => validate("sesh-signal", [null]), invalid("event_after_finish"));
  assert.throws(() => validate("sesh-signal", [{type: "catch", at: 350}]), invalid("invalid_event_fields"));
});
