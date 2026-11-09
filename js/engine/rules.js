import { CHARACTERS, teamOf } from "./characters.js";
import { nextRand } from "./rng.js";

export function byId(state, id) {
  if (id == null) return null;
  return state.players.find((p) => p.id === id) || null;
}

export function findRole(state, role) {
  return state.players.find((p) => p.role === role) || null;
}

export function playersWith(state, role) {
  return state.players.filter((p) => p.role === role);
}

export function isSociallyAlive(player) {
  return !!(player && player.alive && !player.registersDead);
}

export function sociallyAlive(state) {
  return state.players.filter(isSociallyAlive);
}

export function actuallyAlive(state) {
  return state.players.filter((p) => p.alive);
}

export function impairReasons(state, player) {
  if (!player) return [];
  const reasons = [];
  if (player.poisoned) reasons.push("poisoned");
  if (player.drunkUntil && state.time < player.drunkUntil) reasons.push("drunk");
  const courtier = state.effects?.courtier;
  if (courtier && courtier.role === player.role && state.time < courtier.until) reasons.push("courtier");
  if (state.effects?.minstrelUntil && state.time < state.effects.minstrelUntil && player.role !== "minstrel") {
    reasons.push("minstrel");
  }
  return reasons;
}

export function isImpaired(state, player) {
  return impairReasons(state, player).length > 0;
}

export function chronicle(state, text) {
  state.chronicle.push({ time: state.time, text });
  state.recentEvents.push(text);
}

export function publicSay(state, text, extra = {}) {
  state.publicLog.push({
    id: state.publicLog.length,
    time: state.time,
    text,
    kind: extra.kind || "story",
    speakerId: extra.speakerId ?? null,
    toId: extra.toId ?? null,
  });
}

export function addNote(player, text) {
  if (!player.notes.includes(text)) player.notes.push(text);
}

export function markDrunk(state, player, until, kind) {
  if (!player) return;
  player.drunkUntil = Math.max(player.drunkUntil || 0, until);
  player.impairLog.push({ time: state.time, kind, until });
}

export function markWoke(state, player) {
  if (!player || !player.alive) return;
  if (!state.woke.includes(player.id)) state.woke.push(player.id);
}

/**
 * Neighbors are the nearest socially alive players on each side.
 * One lone neighbor does not count as two.
 */
export function livingNeighbors(state, player) {
  const n = state.players.length;
  if (n < 2) return [];
  const seats = [...state.players].sort((a, b) => a.seat - b.seat);
  const idx = seats.findIndex((p) => p.id === player.id);
  let left = null;
  let right = null;
  for (let step = 1; step < n; step++) {
    const q = seats[(idx - step + n) % n];
    if (isSociallyAlive(q)) {
      left = q;
      break;
    }
  }
  for (let step = 1; step < n; step++) {
    const q = seats[(idx + step) % n];
    if (isSociallyAlive(q)) {
      right = q;
      break;
    }
  }
  if (!left || !right || left.id === right.id) return left ? [left] : [];
  return [left, right];
}

function teaLadyProtects(state, target) {
  for (const lady of playersWith(state, "tealady")) {
    if (isImpaired(state, lady)) continue;
    const neighbors = livingNeighbors(state, lady);
    if (neighbors.length !== 2) continue;
    if (!neighbors.every((n) => n.alignment === "good")) continue;
    if (neighbors.some((n) => n.id === target.id)) return true;
  }
  return false;
}

function sailorSafe(state, player) {
  return player.role === "sailor" && !isImpaired(state, player);
}

function innkeeperShield(state, player, reason) {
  if (reason === "execution" || reason === "tinker-day") return false;
  return (player.protections || []).some((token) => token.kind === "innkeeper" && token.night === state.time);
}

function advocateShield(state, player, reason) {
  if (reason !== "execution") return false;
  return (player.protections || []).some((token) => token.kind === "da" && token.day === state.time);
}

function pacifistSaves(state, player, reason) {
  if (reason !== "execution") return false;
  if (player.alignment !== "good") return false;
  const pacifist = findRole(state, "pacifist");
  if (!pacifist || isImpaired(state, pacifist)) return false;
  if (sociallyAlive(state).length <= 3 && !state.mastermindActive) return false;
  if (state.flags?.pacifist === "never") return false;
  if (state.flags?.pacifist === "always") return true;
  return nextRand(state) < 0.38;
}

/**
 * Why a non-Assassin death would fail. "zombuul" is an apparent death.
 * Moonchild's curse is a normal kill and can be saved.
 */
export function preventionReason(state, player, reason) {
  if (sailorSafe(state, player)) return "sailor";
  if (teaLadyProtects(state, player)) return "tealady";
  if (innkeeperShield(state, player, reason)) return "innkeeper";
  if (advocateShield(state, player, reason)) return "devilsadvocate";
  if (pacifistSaves(state, player, reason)) return "pacifist";
  if (player.role === "fool" && !player.abilityUsed && !isImpaired(state, player)) return "fool";
  if (player.role === "zombuul" && !player.registersDead && !isImpaired(state, player)) return "zombuul";
  return null;
}

function rememberDeath(state, player, reason, flags) {
  const entry = {
    playerId: player.id,
    name: player.name,
    reason,
    time: state.time,
    ...flags,
  };
  if (reason === "execution" || reason === "tinker-day") state.dayDeaths.push(entry);
  else state.nightDeaths.push(entry);
}

/**
 * Try to kill a player.
 * opts.bypass — Assassin, ignores every save including the Zombuul's first life.
 * opts.demon — counts as a Demon kill for Grandmother.
 */
export function tryKill(state, targetId, reason, opts = {}) {
  const player = byId(state, targetId);
  if (!player || !player.alive) return { killed: false, why: "absent" };

  if (!opts.bypass) {
    const prevented = preventionReason(state, player, reason);
    if (prevented === "zombuul") {
      player.registersDead = true;
      rememberDeath(state, player, reason, { apparent: true });
      chronicle(state, `${player.name} (Zombuul) is treated as dead but is still alive.`);
      return { killed: false, apparent: true, prevented: "zombuul" };
    }
    if (prevented) {
      if (prevented === "fool") player.abilityUsed = true;
      chronicle(state, `${player.name} was spared (${prevented}) from ${reason}.`);
      return { killed: false, prevented };
    }
  } else if (player.role === "fool") {
    player.abilityUsed = true;
  }

  player.alive = false;
  player.registersDead = false;
  rememberDeath(state, player, reason, { apparent: false });
  chronicle(state, `${player.name} (${CHARACTERS[player.role].name}) died by ${reason}.`);
  if (opts.demon) state.demonKillsTonight.push(player.id);

  if (player.role === "moonchild") {
    player.memory.needsMoonchildChoice = true;
  }

  if (reason === "execution" && teamOf(player.role) === "minion") triggerMinstrel(state);

  if (!opts.holdWin) checkWin(state);
  return { killed: true };
}

function triggerMinstrel(state) {
  const minstrel = findRole(state, "minstrel");
  if (!minstrel || isImpaired(state, minstrel)) return;
  state.effects.minstrelUntil = state.time + 3;
  chronicle(state, "Minstrel: a Minion died by execution, so everyone else is drunk until dusk tomorrow.");
  publicSay(state, "A strange song seems to hang over the square. Thinking feels fuzzy.");
}

export function checkWin(state) {
  if (state.winner || state.mastermindActive) return state.winner;
  const demon = state.players.find((p) => teamOf(p.role) === "demon");
  if (demon && !demon.alive) {
    state.winner = "good";
    state.winReason = "The Demon is dead. The town reaches sunrise.";
    return "good";
  }
  if (actuallyAlive(state).length <= 2) {
    state.winner = "evil";
    state.winReason = "Two players remain, and the Demon is still among them.";
    return "evil";
  }
  return null;
}

export function voteThreshold(state) {
  const n = sociallyAlive(state).length;
  if (n <= 0) return 1;
  return Math.ceil(n / 2);
}

export function voteOrder(state, nomineeId) {
  const seats = [...state.players].sort((a, b) => a.seat - b.seat);
  const idx = seats.findIndex((p) => p.id === nomineeId);
  const order = [];
  for (let step = 1; step <= seats.length; step++) order.push(seats[(idx + step) % seats.length].id);
  return order;
}

/**
 * First night-time choice of the Goon trips them.
 * The Moonchild's public choice is daytime and does not trip the Goon,
 * so a good Goon chosen by the Moonchild can still be cursed.
 */
export function tripGoon(state, actor, targetIds) {
  if (!actor || state.effects.goonUsed) return false;
  for (const id of targetIds) {
    const target = byId(state, id);
    if (!target || target.role !== "goon") continue;
    if (isImpaired(state, target)) return false;
    state.effects.goonUsed = true;
    markDrunk(state, actor, state.time + 2, "goon");
    target.alignment = actor.alignment;
    target.impairLog.push({ time: state.time, kind: `alignment-${target.alignment}` });
    chronicle(state, `${actor.name} chose the Goon and is drunk until dusk. The Goon is now ${target.alignment}.`);
    addNote(target, `Your loyalty shifts. You are now ${target.alignment}.`);
    if (actor.isHuman) addNote(actor, "You chose the Goon. You feel drunk until dusk, and your ability fails.");
    return true;
  }
  return false;
}

export function pushFrame(state, label) {
  const impaired = state.players
    .map((p) => ({ id: p.id, name: p.name, reasons: impairReasons(state, p) }))
    .filter((row) => row.reasons.length);
  state.timeline.push({
    label,
    time: state.time,
    events: state.recentEvents.splice(0, state.recentEvents.length),
    impaired,
  });
}

export function dayNumber(state) {
  return Math.ceil(state.time / 2);
}

export function phaseLabel(state) {
  if (state.phase === "end") return "The grimoire";
  if (state.phase === "reveal") return "Dusk";
  if (state.time === 0) return "First night";
  if (state.time % 2 === 0) return `Night ${state.time / 2 + 1}`;
  return `Day ${dayNumber(state)}`;
}

export function revive(state, player, how) {
  if (!player || player.alive) return false;
  player.alive = true;
  player.registersDead = false;
  state.revivalsTonight.push(player.id);
  chronicle(state, `${player.name} returned to life (${how}).`);
  return true;
}
