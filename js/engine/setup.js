import {
  CHARACTERS,
  DISTRIBUTION,
  TOWNSFOLK,
  OUTSIDERS,
  MINIONS,
  DEMONS,
  GOOD_ROLES,
  teamOf,
} from "./characters.js";
import { initRng, shuffle, pick, nextRand as rand } from "./rng.js";

export const BOT_NAMES = [
  "Bram", "Willa", "Pip", "Nora", "Otto", "Tess", "Hugo", "Fern",
  "Cleo", "Milo", "Sable", "Rowan", "Juniper", "Cass", "Posy", "Nia",
];

export const PERSONALITIES = [
  { id: "sleuth", talk: 0.85, bold: 0.72, honest: 0.92, herd: 0.35 },
  { id: "wallflower", talk: 0.35, bold: 0.22, honest: 0.9, herd: 0.8 },
  { id: "spark", talk: 0.9, bold: 0.66, honest: 0.55, herd: 0.3 },
  { id: "guardian", talk: 0.6, bold: 0.48, honest: 0.95, herd: 0.55 },
  { id: "skeptic", talk: 0.7, bold: 0.84, honest: 0.8, herd: 0.2 },
  { id: "poet", talk: 0.75, bold: 0.4, honest: 0.88, herd: 0.6 },
];

export function baseDistribution(playerCount) {
  const row = DISTRIBUTION[playerCount];
  if (!row) throw new Error(`Player count ${playerCount} is outside 5–15.`);
  return { ...row };
}

/**
 * Godfather shifts Outsiders by +1 or -1 and Townsfolk the other way.
 * If the preferred shift cannot be built from the script, the other shift is used.
 */
export function applyGodfather(state, base, minions) {
  if (!minions.includes("godfather")) return { ...base, outsiderMod: 0 };
  const prefer = rand(state) < 0.5 ? -1 : 1;
  const chosen = [prefer, -prefer].find((mod) => legalShift(base, mod)) || 0;
  return {
    townsfolk: base.townsfolk - chosen,
    outsiders: base.outsiders + chosen,
    minions: base.minions,
    demons: base.demons,
    outsiderMod: chosen,
  };
}

function legalShift(base, mod) {
  const outsiders = base.outsiders + mod;
  const townsfolk = base.townsfolk - mod;
  return outsiders >= 0 && outsiders <= OUTSIDERS.length && townsfolk >= 0 && townsfolk <= TOWNSFOLK.length;
}

function take(state, pool, count) {
  return shuffle(state, pool).slice(0, count);
}

export function dealRoles(state, playerCount, options = {}) {
  if (options.fixedRoles) {
    if (options.fixedRoles.length < 5) throw new Error("fixedRoles needs at least 5");
    return {
      roles: [...options.fixedRoles],
      outsiderMod: options.outsiderMod || 0,
      townsfolk: options.fixedRoles.filter((r) => teamOf(r) === "townsfolk").length,
      outsiders: options.fixedRoles.filter((r) => teamOf(r) === "outsider").length,
      minions: options.fixedRoles.filter((r) => teamOf(r) === "minion").length,
      demons: options.fixedRoles.filter((r) => teamOf(r) === "demon").length,
    };
  }
  const base = baseDistribution(playerCount);
  const demons = options.humanRole && teamOf(options.humanRole) === "demon"
    ? [options.humanRole]
    : take(state, DEMONS, 1);
  let minions = take(state, MINIONS, base.minions);
  if (options.humanRole && teamOf(options.humanRole) === "minion" && !minions.includes(options.humanRole)) {
    minions[0] = options.humanRole;
  }
  const shifted = applyGodfather(state, base, minions);
  let outsiders = take(state, OUTSIDERS, shifted.outsiders);
  let townsfolk = take(state, TOWNSFOLK, shifted.townsfolk);
  if (options.humanRole && teamOf(options.humanRole) === "outsider" && !outsiders.includes(options.humanRole)) {
    if (outsiders.length === 0) {
      // Impossible shift already handled; force the role by borrowing a townsfolk seat.
      if (townsfolk.length) townsfolk.pop();
      outsiders = [options.humanRole];
      shifted.outsiders += 1;
      shifted.townsfolk -= 1;
      shifted.outsiderMod += 1;
    } else outsiders[0] = options.humanRole;
  }
  if (options.humanRole && teamOf(options.humanRole) === "townsfolk" && !townsfolk.includes(options.humanRole)) {
    townsfolk[0] = options.humanRole;
  }
  const roles = shuffle(state, [...townsfolk, ...outsiders, ...minions, ...demons]);
  return { roles, ...shifted };
}

function goodNotInPlay(roles) {
  const used = new Set(roles);
  return GOOD_ROLES.filter((r) => !used.has(r) && r !== "lunatic");
}

function assignBluffs(state, roles, count, { allowInPlay = 0 } = {}) {
  const used = new Set(roles);
  const fresh = shuffle(state, GOOD_ROLES.filter((r) => r !== "lunatic" && !used.has(r)));
  const live = shuffle(state, GOOD_ROLES.filter((r) => r !== "lunatic" && used.has(r)));
  const bluffs = [];
  for (let i = 0; i < allowInPlay && live.length && bluffs.length < count; i++) bluffs.push(live[i]);
  for (const role of fresh) {
    if (bluffs.length >= count) break;
    bluffs.push(role);
  }
  for (const role of live) {
    if (bluffs.length >= count) break;
    if (!bluffs.includes(role)) bluffs.push(role);
  }
  while (bluffs.length < count) bluffs.push(pick(state, TOWNSFOLK));
  return bluffs.slice(0, count);
}

function blankPlayer(id, name, seat, isHuman, personality) {
  return {
    id,
    name,
    seat,
    isHuman,
    personality,
    role: null,
    alignment: "good",
    perceivedRole: null,
    alive: true,
    registersDead: false,
    ghostVote: true,
    abilityUsed: false,
    drunkUntil: 0,
    poisoned: false,
    poisonSource: null,
    protections: [],
    memory: {},
    notes: [],
    brief: null,
    impairLog: [],
  };
}

export function createState(options = {}) {
  const seed = options.seed ?? Math.floor(Math.random() * 999983);
  const state = {
    v: 1,
    seed,
    rngState: initRng(seed),
    humanName: sanitizeName(options.humanName || "Luca"),
    players: [],
    time: 0,
    phase: "reveal",
    pending: null,
    beat: false,
    effects: {
      courtier: null,
      minstrelUntil: 0,
      pukkaVictim: null,
      moonchild: null,
      goonUsed: false,
    },
    woke: [],
    demonKillsTonight: [],
    nightDeaths: [],
    dayDeaths: [],
    revivalsTonight: [],
    demonSuppressed: false,
    exorcistName: null,
    publicLog: [],
    claims: [],
    chronicle: [],
    recentEvents: [],
    timeline: [],
    gossip: null,
    onBlock: null,
    ballot: null,
    nomCursor: 0,
    nominatedBy: {},
    mastermindActive: false,
    finalDay: false,
    winner: null,
    winReason: "",
    resigned: false,
    outsiderMod: 0,
    inPlay: [],
    nightPlan: null,
    nightIndex: 0,
    flags: options.flags || {},
    dayNumberSeen: 0,
    moonchildQueue: null,
  };

  const playerCount = options.fixedRoles ? options.fixedRoles.length : options.playerCount;
  if (!playerCount || playerCount < 5 || playerCount > 15) {
    throw new Error("Choose a player count from 5 to 15.");
  }
  const dealt = dealRoles(state, playerCount, options);
  state.outsiderMod = dealt.outsiderMod;
  state.inPlay = [...dealt.roles];

  const humanSeat = options.allBots
    ? -1
    : options.humanSeat != null
      ? options.humanSeat
      : Math.floor(rand(state) * playerCount);

  const names = shuffle(state, BOT_NAMES.filter((n) => n.toLowerCase() !== state.humanName.toLowerCase()));
  let botName = 0;
  for (let seat = 0; seat < playerCount; seat++) {
    const isHuman = seat === humanSeat;
    const personality = isHuman ? null : PERSONALITIES[seat % PERSONALITIES.length];
    const name = isHuman ? state.humanName : names[botName++];
    state.players.push(blankPlayer(seat, name, seat, isHuman, personality));
  }

  let roles = [...dealt.roles];
  if (!options.allBots && options.humanRole) {
    const idx = roles.indexOf(options.humanRole);
    if (idx >= 0 && idx !== humanSeat) {
      const swap = roles[humanSeat];
      roles[humanSeat] = roles[idx];
      roles[idx] = swap;
    }
  }
  state.players.forEach((player, i) => {
    player.role = roles[i];
    player.perceivedRole = roles[i];
    const team = teamOf(roles[i]);
    player.alignment = team === "minion" || team === "demon" ? "evil" : "good";
  });

  wireLunatic(state, roles);
  wireEvilBriefs(state);
  wireGrandchild(state);
  assignPublicBluffs(state);
  return state;
}

function sanitizeName(name) {
  const clean = String(name).replace(/[<>&]/g, "").trim().slice(0, 16);
  return clean || "Luca";
}

function wireGrandchild(state) {
  const grandmother = state.players.find((p) => p.role === "grandmother");
  if (!grandmother) return;
  const towns = state.players.filter((p) => p.id !== grandmother.id && p.alignment === "good" && teamOf(p.role) === "townsfolk");
  const goods = state.players.filter((p) => p.id !== grandmother.id && p.alignment === "good");
  const chosen = (towns.length ? towns : goods)[0] ? pick(state, towns.length ? towns : goods) : null;
  state.grandchild = chosen
    ? { grandmotherId: grandmother.id, playerId: chosen.id, role: chosen.role }
    : null;
}

function wireLunatic(state, roles) {
  const lunatic = state.players.find((p) => p.role === "lunatic");
  state.lunatic = null;
  if (!lunatic) return;
  const realDemon = state.players.find((p) => teamOf(p.role) === "demon");
  const choices = DEMONS.filter((d) => d !== realDemon?.role);
  const thinks = choices.length ? pick(state, choices) : "po";
  lunatic.perceivedRole = thinks;
  const minionCount = state.players.filter((p) => teamOf(p.role) === "minion").length;
  const preferred = shuffle(state, state.players.filter((p) => p.id !== lunatic.id && p.alignment === "good" && p.id !== realDemon?.id));
  const fallback = shuffle(state, state.players.filter((p) => p.id !== lunatic.id && p.id !== realDemon?.id));
  const fakePlayers = [];
  for (const pool of [preferred, fallback, shuffle(state, state.players.filter((p) => p.id !== lunatic.id))]) {
    for (const player of pool) {
      if (fakePlayers.length >= minionCount) break;
      if (!fakePlayers.some((p) => p.id === player.id)) fakePlayers.push(player);
    }
  }
  const fakeRoles = shuffle(state, MINIONS).slice(0, Math.max(minionCount, 0));
  while (fakeRoles.length < fakePlayers.length) fakeRoles.push(pick(state, MINIONS));
  const teammates = fakePlayers.map((player, i) => ({
    id: player.id,
    name: player.name,
    role: fakeRoles[i],
  }));
  const bluffs = assignBluffs(state, roles, 3, { allowInPlay: 1 });
  lunatic.brief = { teammates, bluffs, lunaticId: null, feelsEvil: true };
  lunatic.alignment = "good";
  state.lunatic = { playerId: lunatic.id, thinks, fakeMinionIds: teammates.map((t) => t.id) };
  lunatic.memory.fakeDemon = thinks;
}

function wireEvilBriefs(state) {
  const demon = state.players.find((p) => teamOf(p.role) === "demon");
  const minions = state.players.filter((p) => teamOf(p.role) === "minion");
  const bluffs = assignBluffs(state, state.inPlay, 3, { allowInPlay: 0 });
  state.demonBluffs = bluffs;
  const minionCards = minions.map((m) => ({ id: m.id, name: m.name, role: m.role }));
  if (demon) {
    demon.brief = {
      teammates: minionCards,
      bluffs,
      lunaticId: state.lunatic?.playerId ?? null,
      feelsEvil: true,
    };
  }
  for (const minion of minions) {
    minion.brief = {
      teammates: [
        ...(demon ? [{ id: demon.id, name: demon.name, role: demon.role }] : []),
        ...minionCards.filter((card) => card.id !== minion.id),
      ],
      bluffs,
      lunaticId: null,
      feelsEvil: true,
    };
  }
}

function assignPublicBluffs(state) {
  const demon = state.players.find((p) => teamOf(p.role) === "demon");
  const minions = state.players.filter((p) => teamOf(p.role) === "minion");
  const bluffs = state.demonBluffs || [];
  const evil = [demon, ...minions].filter(Boolean);
  evil.forEach((player, index) => {
    if (index < bluffs.length) player.memory.bluffRole = bluffs[index];
    else player.memory.bluffRole = bluffs[0] || "fool";
  });
  if (evil.length > bluffs.length && evil.length > 1 && rand(state) < 0.5) {
    const inPlayTown = state.players.find((p) => teamOf(p.role) === "townsfolk");
    if (inPlayTown) evil[evil.length - 1].memory.bluffRole = inPlayTown.role;
  }
  const lunatic = state.players.find((p) => p.role === "lunatic");
  if (lunatic?.brief?.bluffs?.length) lunatic.memory.bluffRole = lunatic.brief.bluffs[0];
}

export function roleName(id) {
  return CHARACTERS[id]?.name || id;
}
