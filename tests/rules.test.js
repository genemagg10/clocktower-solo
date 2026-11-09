import test from "node:test";
import assert from "node:assert/strict";
import { DISTRIBUTION, FIRST_NIGHT, OTHER_NIGHT, teamOf } from "../js/engine/characters.js";
import { baseDistribution, applyGodfather, createState } from "../js/engine/setup.js";
import { createGame, autoplay, submit, pump, summarize } from "../js/engine/game.js";
import { getSelfView } from "../js/engine/view.js";
import { tryKill, isImpaired, checkWin } from "../js/engine/rules.js";
import {
  applyPukka,
  applyPo,
  applyShabaloth,
  applyZombuul,
  maybeRegurgitate,
  setMoonchildChoice,
  resolveMoonchild,
  prepareNight,
} from "../js/engine/night.js";
import { concludeDay } from "../js/engine/day.js";

test("distribution matches the standard 5 to 15 table", () => {
  const expect = {
    5: [3, 0, 1, 1],
    6: [3, 1, 1, 1],
    7: [5, 0, 1, 1],
    8: [5, 1, 1, 1],
    9: [5, 2, 1, 1],
    10: [7, 0, 2, 1],
    11: [7, 1, 2, 1],
    12: [7, 2, 2, 1],
    13: [9, 0, 3, 1],
    14: [9, 1, 3, 1],
    15: [9, 2, 3, 1],
  };
  for (const [count, row] of Object.entries(expect)) {
    const dist = baseDistribution(Number(count));
    assert.deepEqual([dist.townsfolk, dist.outsiders, dist.minions, dist.demons], row);
    assert.equal(row.reduce((a, b) => a + b, 0), Number(count));
    assert.equal(DISTRIBUTION[count].townsfolk, row[0]);
  }
});

test("dealt roles always match the table, and Godfather shifts outsiders by one", () => {
  for (let count = 5; count <= 15; count++) {
    for (let seed = 1; seed <= 30; seed++) {
      const state = createState({ playerCount: count, seed, allBots: true });
      const base = baseDistribution(count);
      const tally = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
      for (const player of state.players) tally[teamOf(player.role)] += 1;
      assert.equal(tally.demon, 1);
      assert.equal(tally.minion, base.minions);
      const godfather = state.players.some((p) => p.role === "godfather");
      if (godfather) {
        assert.ok(state.outsiderMod === 1 || state.outsiderMod === -1);
        assert.equal(tally.outsider, base.outsiders + state.outsiderMod);
        assert.equal(tally.townsfolk, base.townsfolk - state.outsiderMod);
      } else {
        assert.equal(state.outsiderMod, 0);
        assert.equal(tally.outsider, base.outsiders);
        assert.equal(tally.townsfolk, base.townsfolk);
      }
      assert.equal(state.players.length, count);
    }
  }
});

test("Godfather refuses an impossible shift", () => {
  const state = { rngState: 1 };
  const shifted = applyGodfather(state, baseDistribution(5), ["godfather"]);
  assert.equal(shifted.outsiders, 1);
  assert.equal(shifted.townsfolk, 2);
  assert.equal(shifted.outsiderMod, 1);
});

test("night order puts protection and the Lunatic before Demon attacks, and Chambermaid last", () => {
  const other = OTHER_NIGHT;
  const before = (a, b) => assert.ok(other.indexOf(a) < other.indexOf(b), `${a} before ${b}`);
  before("lunatic", "exorcist");
  before("exorcist", "zombuul");
  before("innkeeper", "zombuul");
  before("devilsadvocate", "zombuul");
  before("zombuul", "pukka");
  before("pukka", "shabaloth");
  before("shabaloth", "po");
  before("po", "assassin");
  before("assassin", "godfather");
  before("godfather", "gossip");
  before("gossip", "professor");
  before("professor", "tinker");
  before("tinker", "moonchild");
  before("moonchild", "grandmother");
  assert.equal(other.at(-1), "chambermaid");
  assert.equal(FIRST_NIGHT[0], "briefing");
  assert.ok(FIRST_NIGHT.indexOf("lunatic") < FIRST_NIGHT.indexOf("pukka"));
  assert.ok(FIRST_NIGHT.indexOf("pukka") < FIRST_NIGHT.indexOf("grandmother"));
  assert.equal(FIRST_NIGHT.at(-1), "chambermaid");
  assert.ok(!FIRST_NIGHT.includes("exorcist"));
  assert.ok(!FIRST_NIGHT.includes("shabaloth"));
});

function scripted(roles, seed = 3) {
  return createGame({ fixedRoles: roles, seed, allBots: true });
}

test("Lunatic is shown a Demon life and does not kill; the Demon learns the choice", () => {
  const state = scripted([
    "lunatic", "sailor", "grandmother", "chambermaid", "godfather", "pukka",
  ], 9);
  const lunatic = state.players.find((p) => p.role === "lunatic");
  const demon = state.players.find((p) => p.role === "pukka");
  lunatic.isHuman = true;
  state.humanId = lunatic.id;
  const view = getSelfView(state, lunatic.id);
  assert.notEqual(view.shownRole, "lunatic");
  assert.equal(teamOf(view.shownRole), "demon");
  assert.equal(view.feelsEvil, true);
  assert.equal(view.alignmentLabel, "evil");
  assert.ok(view.teammates.length >= 1);
  assert.equal(view.bluffs.length, 3);
  assert.equal(JSON.stringify(view).includes("lunatic"), false);
  assert.equal(lunatic.alignment, "good");

  const demonView = getSelfView(state, demon.id);
  assert.equal(demonView.shownRole, "pukka");
  assert.equal(demonView.lunaticHint.id, lunatic.id);
  assert.ok(demonView.teammates.some((card) => card.role === "godfather"));

  state.phase = "night";
  state.pending = null;
  state.time = 2;
  prepareNight(state);
  state.lunaticReport = null;
  const sailor = state.players.find((p) => p.role === "sailor");
  const target = state.players.find((p) => p.role === "grandmother");
  state.players.forEach((p) => {
    p.alive = true;
  });
  // Resolve the lunatic as their believed demon without touching real health.
  const before = state.players.filter((p) => p.alive).length;
  state.pending = {
    kind: "players",
    step: "lunatic",
    actorId: lunatic.id,
    min: 1,
    max: 1,
    options: state.players.map((p) => p.id),
  };
  submit(state, { ids: [target.id] }, { until: () => true });
  assert.equal(state.players.filter((p) => p.alive).length, before);
  assert.equal(target.alive, true);
  assert.ok(state.lunaticReport);
  assert.deepEqual(state.lunaticReport.ids, [target.id]);
  assert.equal(sailor.alive, true);
});

test("a human Lunatic keeps the Demon mask through death until the grimoire exists", () => {
  const state = scripted(["lunatic", "fool", "sailor", "empath".replace("empath", "grandmother"), "assassin", "shabaloth"]);
  const lunatic = state.players.find((p) => p.role === "lunatic");
  lunatic.isHuman = true;
  tryKill(state, lunatic.id, "shabaloth", { demon: true, holdWin: true });
  const view = getSelfView(state, lunatic.id);
  assert.equal(teamOf(view.shownRole), "demon");
  assert.equal(JSON.stringify(view).toLowerCase().includes("lunatic"), false);
  assert.equal(state.players.find((p) => p.role === "lunatic").role, "lunatic");
});

test("Pukka poisons, then the poisoned player dies and the new one is poisoned", () => {
  const state = scripted(["sailor", "fool", "grandmother", "chambermaid", "assassin", "pukka"]);
  const pukka = state.players.find((p) => p.role === "pukka");
  const first = state.players.find((p) => p.role === "sailor");
  const second = state.players.find((p) => p.role === "fool");
  applyPukka(state, pukka, first.id);
  assert.equal(first.poisoned, true);
  assert.equal(first.alive, true);
  assert.equal(isImpaired(state, first), true);
  state.time = 2;
  applyPukka(state, pukka, second.id);
  assert.equal(first.alive, false);
  assert.equal(first.poisoned, false);
  assert.equal(second.poisoned, true);
  assert.equal(second.alive, true);
});

test("a poisoned Sailor can die, and a sober Sailor cannot", () => {
  const state = scripted(["sailor", "fool", "grandmother", "chambermaid", "assassin", "po"]);
  const sailor = state.players.find((p) => p.role === "sailor");
  const saved = tryKill(state, sailor.id, "po", { demon: true, holdWin: true });
  assert.equal(saved.killed, false);
  assert.equal(saved.prevented, "sailor");
  sailor.poisoned = true;
  const dead = tryKill(state, sailor.id, "po", { demon: true, holdWin: true });
  assert.equal(dead.killed, true);
  assert.equal(sailor.alive, false);
});

test("Assassin pierces the Sailor and the Zombuul's first life", () => {
  const state = scripted(["sailor", "fool", "grandmother", "zombuul", "assassin", "chambermaid"]);
  const sailor = state.players.find((p) => p.role === "sailor");
  const zombuul = state.players.find((p) => p.role === "zombuul");
  assert.equal(tryKill(state, sailor.id, "assassin", { bypass: true, holdWin: true }).killed, true);
  assert.equal(tryKill(state, zombuul.id, "assassin", { bypass: true, holdWin: true }).killed, true);
  assert.equal(zombuul.alive, false);
  checkWin(state);
  assert.equal(state.winner, "good");
});

test("Zombuul skips a kill after a day death, then registers dead before really dying", () => {
  const state = scripted(["fool", "sailor", "grandmother", "chambermaid", "godfather", "zombuul"]);
  const zombuul = state.players.find((p) => p.role === "zombuul");
  const fool = state.players.find((p) => p.role === "fool");
  state.dayDeaths = [{ playerId: 9, apparent: false, reason: "execution" }];
  state.time = 2;
  applyZombuul(state, zombuul, fool.id);
  assert.equal(fool.alive, true, "no kill when someone died today");
  state.dayDeaths = [];
  applyZombuul(state, zombuul, fool.id);
  assert.equal(fool.alive, false);
  const first = tryKill(state, zombuul.id, "execution", { holdWin: true });
  assert.equal(first.apparent, true);
  assert.equal(zombuul.alive, true);
  assert.equal(zombuul.registersDead, true);
  const second = tryKill(state, zombuul.id, "execution", { holdWin: true });
  assert.equal(second.killed, true);
  checkWin(state);
  assert.equal(state.winner, "good");
});

test("Shabaloth kills two and can regurgitate one", () => {
  const state = scripted(["fool", "sailor", "grandmother", "chambermaid", "assassin", "shabaloth"]);
  const demon = state.players.find((p) => p.role === "shabaloth");
  const targets = ["grandmother", "chambermaid"].map((role) => state.players.find((p) => p.role === role));
  applyShabaloth(state, demon, targets.map((p) => p.id));
  assert.equal(targets[0].alive, false);
  assert.equal(targets[1].alive, false);
  state.time = 4;
  const revived = maybeRegurgitate(state, demon, () => 0.1);
  assert.ok(revived);
  assert.equal(revived.alive, true);
});

test("Po charges on an empty night and then kills three", () => {
  const state = scripted([
    "fool", "sailor", "grandmother", "chambermaid", "gossip", "professor", "assassin", "po",
  ]);
  const po = state.players.find((p) => p.role === "po");
  const pool = state.players.filter((p) => p.id !== po.id);
  applyPo(state, po, []);
  assert.equal(po.memory.poMustTriple, true);
  assert.equal(pool.every((p) => p.alive), true);
  const victims = ["grandmother", "chambermaid", "gossip"].map((role) => state.players.find((p) => p.role === role));
  applyPo(state, po, victims.map((p) => p.id));
  assert.equal(victims.every((p) => !p.alive), true);
  assert.equal(po.memory.poMustTriple, false);
});

test("Moonchild curses the alignment they saw when they chose, if sober that night", () => {
  const state = scripted(["moonchild", "fool", "sailor", "grandmother", "assassin", "po"]);
  const moon = state.players.find((p) => p.role === "moonchild");
  const good = state.players.find((p) => p.role === "grandmother");
  const evil = state.players.find((p) => p.role === "assassin");
  tryKill(state, moon.id, "po", { demon: true, holdWin: true });
  assert.equal(moon.memory.needsMoonchildChoice, true);
  state.time = 3;
  setMoonchildChoice(state, moon.id, good.id);
  state.time = 4;
  resolveMoonchild(state);
  assert.equal(good.alive, false);

  const state2 = scripted(["moonchild", "fool", "sailor", "grandmother", "assassin", "po"], 4);
  const moon2 = state2.players.find((p) => p.role === "moonchild");
  const evil2 = state2.players.find((p) => p.role === "assassin");
  tryKill(state2, moon2.id, "po", { demon: true, holdWin: true });
  state2.time = 3;
  setMoonchildChoice(state2, moon2.id, evil2.id);
  moon2.poisoned = true;
  state2.time = 4;
  resolveMoonchild(state2);
  assert.equal(evil2.alive, true);
  moon2.poisoned = false;
  state2.effects.moonchild = { moonId: moon2.id, targetId: evil2.id, wasGood: false, setTime: 3 };
  resolveMoonchild(state2);
  assert.equal(evil2.alive, true, "evil target is not cursed");
});

test("executing the Demon wins for good, unless a sober Mastermind buys one more day", () => {
  const plain = scripted(["fool", "sailor", "grandmother", "chambermaid", "assassin", "po"]);
  plain.time = 1;
  plain.phase = "resolve";
  const demon = plain.players.find((p) => p.role === "po");
  plain.onBlock = { playerId: demon.id, tally: 3 };
  concludeDay(plain);
  assert.equal(plain.winner, "good");

  const delayed = scripted(["fool", "sailor", "grandmother", "chambermaid", "mastermind", "po"], 2);
  delayed.time = 1;
  delayed.phase = "resolve";
  const demon2 = delayed.players.find((p) => p.role === "po");
  delayed.onBlock = { playerId: demon2.id, tally: 4 };
  concludeDay(delayed);
  assert.equal(delayed.winner, null);
  assert.equal(delayed.mastermindActive, true);
  assert.equal(demon2.alive, false);
  delayed.finalDay = true;
  delayed.phase = "resolve";
  const good = delayed.players.find((p) => p.role === "fool");
  delayed.onBlock = { playerId: good.id, tally: 2 };
  concludeDay(delayed);
  assert.equal(delayed.winner, "evil");
});

test("Mastermind day: executing evil or nobody means good wins, and two alive does not end it early", () => {
  const state = scripted(["fool", "sailor", "grandmother", "chambermaid", "mastermind", "shabaloth"], 6);
  state.mastermindActive = true;
  state.finalDay = true;
  state.time = 3;
  const alive = state.players.filter((p) => p.alive);
  assert.ok(alive.length > 2);
  state.players.forEach((p) => {
    if (p.role !== "shabaloth" && p.role !== "mastermind") p.alive = false;
  });
  state.players.find((p) => p.role === "shabaloth").alive = false;
  assert.equal(checkWin(state), null, "population win waits while Mastermind day is open");
  state.onBlock = null;
  state.phase = "resolve";
  concludeDay(state);
  assert.equal(state.winner, "good");
});

test("two living players, Demon included, is an evil win", () => {
  const state = scripted(["fool", "sailor", "grandmother", "chambermaid", "assassin", "po"]);
  for (const player of state.players) {
    if (player.role !== "po" && player.role !== "fool") player.alive = false;
  }
  assert.equal(checkWin(state), "evil");
});

test("simulated bot games finish at several player counts", () => {
  const counts = [5, 6, 7, 9, 10, 12, 15];
  for (const playerCount of counts) {
    for (const seed of [1, 8, 21]) {
      const state = autoplay({ playerCount, seed, allBots: true });
      assert.ok(state.winner === "good" || state.winner === "evil", summarize(state));
      assert.ok(state.timeline.length >= 1);
      assert.equal(state.phase, "end");
      assert.ok(state.players.some((p) => teamOf(p.role) === "demon"));
    }
  }
});

test("a full bot game with a Lunatic and each Demon type finishes", () => {
  const demons = ["zombuul", "pukka", "shabaloth", "po"];
  for (const demon of demons) {
    const roles = ["grandmother", "sailor", "chambermaid", "gossip", "innkeeper", "professor", "lunatic", "godfather", "assassin", demon];
    const state = autoplay({ fixedRoles: roles, seed: 4, allBots: true, outsiderMod: 1 });
    assert.ok(state.winner === "good" || state.winner === "evil");
    const lunatic = state.players.find((p) => p.role === "lunatic");
    assert.ok(lunatic.perceivedRole);
    assert.notEqual(lunatic.perceivedRole, demon);
    assert.equal(teamOf(lunatic.perceivedRole), "demon");
  }
});
