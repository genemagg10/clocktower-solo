import { CHARACTERS, FIRST_NIGHT, OTHER_NIGHT, CHARACTER_LIST, teamOf } from "./characters.js";
import { nextRand, shuffle } from "./rng.js";
import {
  byId,
  findRole,
  isImpaired,
  isSociallyAlive,
  markWoke,
  markDrunk,
  tryKill,
  tripGoon,
  chronicle,
  addNote,
  revive,
  checkWin,
  publicSay,
} from "./rules.js";
import { roleName } from "./setup.js";

export { FIRST_NIGHT, OTHER_NIGHT };

export function prepareNight(state) {
  state.nightPlan = (state.time === 0 ? FIRST_NIGHT : OTHER_NIGHT).slice();
  state.nightIndex = 0;
  state.woke = [];
  state.demonKillsTonight = [];
  state.nightDeaths = [];
  state.revivalsTonight = [];
  state.demonSuppressed = false;
  state.exorcistId = null;
  state.effects.goonUsed = false;
  if (state.time === 0) {
    for (const player of state.players) {
      if (!player.alive) continue;
      const team = teamOf(player.role);
      if (team === "demon" || team === "minion" || player.role === "lunatic") markWoke(state, player);
    }
  }
}

export function startNightStep(state) {
  if (state.nightIndex >= state.nightPlan.length) return "finished";
  const step = state.nightPlan[state.nightIndex];
  openStep(state, step);
  if (state.pending) return "pending";
  state.nightIndex += 1;
  return state.nightIndex >= state.nightPlan.length ? "finished" : "continue";
}

export function commitNightChoice(state, pending, choice) {
  state.pending = null;
  const follow = resolveStep(state, pending, choice);
  if (follow) {
    state.pending = follow;
    return;
  }
  state.nightIndex += 1;
}

function openStep(state, step) {
  const actor = step === "lunatic"
    ? findRole(state, "lunatic")
    : findRole(state, step);
  switch (step) {
    case "briefing":
      return;
    case "lunatic":
      openLunatic(state, actor);
      return;
    case "sailor":
    case "chambermaid":
    case "exorcist":
    case "innkeeper":
    case "gambler":
    case "devilsadvocate":
      openChooser(state, step, actor);
      return;
    case "courtier":
      openCourtier(state, actor);
      return;
    case "professor":
      openProfessor(state, actor);
      return;
    case "assassin":
      openAssassin(state, actor);
      return;
    case "godfather":
      openGodfather(state, actor);
      return;
    case "grandmother":
      openGrandmother(state, actor);
      return;
    case "gossip":
      resolveGossip(state);
      return;
    case "tinker":
      resolveTinker(state);
      return;
    case "moonchild":
      resolveMoonchild(state);
      return;
    case "pukka":
    case "zombuul":
    case "shabaloth":
    case "po":
      openDemon(state, step);
      return;
    default:
      return;
  }
}

function canAct(actor) {
  return !!(actor && actor.alive);
}

function othersAlive(state, actor, { self = false } = {}) {
  return state.players.filter((p) => isSociallyAlive(p) && (self || p.id !== actor.id)).map((p) => p.id);
}

function ack(actor, title, text) {
  return { kind: "ack", step: "info", actorId: actor.id, title, text, private: true };
}

function playerPrompt(actor, step, { title, text, min, max, options, allowPass = false, allowZero = false }) {
  return {
    kind: "players",
    step,
    actorId: actor.id,
    title,
    text,
    min,
    max,
    options,
    allowPass,
    allowZero,
    private: true,
  };
}

function openChooser(state, step, actor) {
  if (!canAct(actor)) return;
  if (step === "exorcist" || step === "innkeeper" || step === "gambler") {
    if (state.time === 0) return;
  }
  markWoke(state, actor);
  if (step === "sailor") {
    const options = othersAlive(state, actor, { self: true });
    if (!options.length) return;
    state.pending = playerPrompt(actor, step, {
      title: "Sailor",
      text: "Choose a living player. You or they will be drunk until dusk.",
      min: 1, max: 1, options,
    });
    return;
  }
  if (step === "chambermaid") {
    const options = othersAlive(state, actor, { self: false });
    if (options.length < 2) return;
    state.pending = playerPrompt(actor, step, {
      title: "Chambermaid",
      text: "Choose two living players. You will learn how many woke for their own ability.",
      min: 2, max: 2, options,
    });
    return;
  }
  if (step === "innkeeper") {
    const options = othersAlive(state, actor, { self: true });
    if (options.length < 2) return;
    state.pending = playerPrompt(actor, step, {
      title: "Innkeeper",
      text: "Choose two players. They cannot die tonight, but one will be drunk until dusk.",
      min: 2, max: 2, options,
    });
    return;
  }
  if (step === "devilsadvocate") {
    const ban = actor.memory.daLast;
    const options = othersAlive(state, actor, { self: true }).filter((id) => id !== ban);
    if (!options.length) return;
    state.pending = playerPrompt(actor, step, {
      title: "Devil's Advocate",
      text: "Choose a living player you did not choose last night. An execution tomorrow will not kill them.",
      min: 1, max: 1, options,
    });
    return;
  }
  if (step === "exorcist") {
    const ban = actor.memory.exLast;
    const options = state.players.map((p) => p.id).filter((id) => id !== actor.id && id !== ban);
    if (!options.length) return;
    state.pending = playerPrompt(actor, step, {
      title: "Exorcist",
      text: "Choose a player you did not choose last night. If they are the Demon, they do not wake.",
      min: 1, max: 1, options,
    });
    return;
  }
  if (step === "gambler") {
    const options = state.players.map((p) => p.id);
    state.pending = {
      kind: "gambler",
      step,
      actorId: actor.id,
      title: "Gambler",
      text: "Choose a player and name a character. A wrong guess kills you.",
      playerOptions: options,
      roleOptions: CHARACTER_LIST.map((c) => c.id),
      private: true,
    };
  }
}

function openCourtier(state, actor) {
  if (!canAct(actor) || actor.memory.courtierUsed) return;
  markWoke(state, actor);
  state.pending = {
    kind: "role",
    step: "courtier",
    actorId: actor.id,
    title: "Courtier",
    text: "You may name a character once. If they are in play, they are drunk for three nights and three days. You may wait.",
    options: CHARACTER_LIST.map((c) => c.id),
    allowPass: true,
    private: true,
  };
}

function openProfessor(state, actor) {
  if (!canAct(actor) || actor.memory.professorUsed || state.time === 0) return;
  const options = state.players.filter((p) => !isSociallyAlive(p) && p.id !== actor.id).map((p) => p.id);
  if (!options.length) return;
  markWoke(state, actor);
  state.pending = playerPrompt(actor, "professor", {
    title: "Professor",
    text: "You may choose a dead player once. If they are a Townsfolk, they live again. You may wait.",
    min: 1, max: 1, options, allowPass: true,
  });
}

function openAssassin(state, actor) {
  if (!canAct(actor) || actor.memory.assassinUsed || state.time === 0) return;
  const options = state.players.filter((p) => p.id !== actor.id).map((p) => p.id);
  markWoke(state, actor);
  state.pending = playerPrompt(actor, "assassin", {
    title: "Assassin",
    text: "You may choose a player once. They die, and nothing can save them. You may wait.",
    min: 1, max: 1, options, allowPass: true,
  });
}

function openGodfather(state, actor) {
  if (!canAct(actor)) return;
  if (state.time === 0) {
    markWoke(state, actor);
    const truth = state.players.filter((p) => teamOf(p.role) === "outsider").map((p) => p.role);
    let shown = truth;
    if (isImpaired(state, actor)) shown = fakeOutsiders(state, truth);
    const label = shown.length ? shown.map(roleName).join(", ") : "no Outsiders";
    const text = `The Outsiders in play: ${label}.`;
    addNote(actor, text);
    actor.memory.outsiderInfo = shown;
    if (actor.isHuman) state.pending = ack(actor, "Godfather", text);
    return;
  }
  const died = state.dayDeaths.filter((d) => !d.apparent).length;
  if (died !== 1) return;
  markWoke(state, actor);
  const options = othersAlive(state, actor, { self: true });
  if (!options.length) return;
  state.pending = playerPrompt(actor, "godfather", {
    title: "Godfather",
    text: "Exactly one player died today. Choose a player to die.",
    min: 1, max: 1, options,
  });
}

function fakeOutsiders(state, truth) {
  const pool = shuffle(state, ["tinker", "moonchild", "goon", "lunatic"]);
  if (truth.length === 0) return [pool[0]];
  const alt = pool.filter((r) => !truth.includes(r));
  const shown = [];
  for (let i = 0; i < truth.length; i++) shown.push(alt[i] || pool[i]);
  if (shown.join() === truth.join()) shown[0] = pool.find((r) => r !== shown[0]) || shown[0];
  return shown;
}

function openGrandmother(state, actor) {
  if (!actor) return;
  if (state.time === 0) {
    if (!actor.alive) return;
    markWoke(state, actor);
    const link = state.grandchild;
    let told = link ? { id: link.playerId, role: link.role } : null;
    if (!told || isImpaired(state, actor)) told = falseGrandchild(state, actor, link);
    const who = byId(state, told.id);
    const text = who
      ? `You dream of ${who.name}. They are the ${roleName(told.role)}.`
      : "The dream is empty.";
    addNote(actor, text);
    actor.memory.grandchild = { id: told.id, role: told.role, believed: true };
    if (actor.isHuman) state.pending = ack(actor, "Grandmother", text);
    return;
  }
  if (!actor.alive || isImpaired(state, actor) || !state.grandchild) return;
  const grandId = state.grandchild.playerId;
  if (state.demonKillsTonight.includes(grandId) && !byId(state, grandId).alive) {
    tryKill(state, actor.id, "grandmother");
  }
}

function falseGrandchild(state, actor, link) {
  const options = state.players.filter((p) => p.id !== actor.id);
  const who = options[Math.floor(nextRand(state) * options.length)];
  let role = who.role;
  if (link && who.id === link.playerId && role === link.role) {
    role = TOWNS_FALLBACK(who.role);
  }
  if (who.role === role && link && who.id === link.playerId) role = "fool";
  return { id: who.id, role };
}

function TOWNS_FALLBACK(current) {
  return current === "sailor" ? "fool" : "sailor";
}

function openLunatic(state, actor) {
  if (!canAct(actor)) return;
  const thinks = actor.perceivedRole;
  if (!demonAttacksTonight(state, thinks, actor)) return;
  markWoke(state, actor);
  const prompt = demonPrompt(state, actor, thinks, { lunatic: true });
  if (prompt) state.pending = prompt;
}

function openDemon(state, step) {
  const actor = findRole(state, step);
  if (!canAct(actor)) return;
  if (state.demonSuppressed) {
    const ex = state.exorcistId != null ? byId(state, state.exorcistId) : null;
    const text = ex
      ? `${ex.name} is the Exorcist. You do not wake tonight.`
      : "You do not wake tonight.";
    addNote(actor, text);
    if (state.lunaticReport) state.lunaticReport.delivered = true;
    if (actor.isHuman) state.pending = ack(actor, "Silenced", text);
    return;
  }
  if (!demonAttacksTonight(state, step, actor)) return;
  markWoke(state, actor);
  const prompt = demonPrompt(state, actor, step, { lunatic: false });
  if (prompt) state.pending = prompt;
}

export function demonAttacksTonight(state, role, actor) {
  if (role === "pukka") return true;
  if (state.time === 0) return false;
  if (role === "zombuul") return state.dayDeaths.filter((d) => !d.apparent).length === 0;
  if (role === "shabaloth" || role === "po") return true;
  return false;
}

function demonPrompt(state, actor, role, { lunatic }) {
  const spec = demonSpec(actor, role);
  const options = state.players.filter(isSociallyAlive).map((p) => p.id);
  if (!options.length) return null;
  let max = spec.max;
  let min = spec.min;
  if (options.length < max) {
    max = options.length;
    min = spec.allowZero ? 0 : Math.min(spec.min, max);
  }
  const extra = !lunatic ? deliverLunaticText(state) : "";
  const flavor = {
    pukka: "Choose a player to poison. Last night's poison will take its due first.",
    zombuul: "Nobody died today. Choose a player to die.",
    shabaloth: "Choose two players to die. Something you swallowed might come back up.",
    po: spec.min === 3
      ? "You held back last night. Choose three players to die."
      : "Choose a player to die, or choose nobody and gather your strength.",
  }[role];
  return playerPrompt(actor, lunatic ? "lunatic" : role, {
    title: CHARACTERS[role].name,
    text: `${extra ? `${extra} ` : ""}${flavor}`,
    min,
    max,
    options,
    allowZero: spec.allowZero && min === 0,
  });
}

function demonSpec(actor, role) {
  if (role === "shabaloth") return { min: 2, max: 2, allowZero: false };
  if (role === "po" && actor.memory.poMustTriple) return { min: 3, max: 3, allowZero: false };
  if (role === "po") return { min: 0, max: 1, allowZero: true };
  return { min: 1, max: 1, allowZero: false };
}

function deliverLunaticText(state) {
  const lunatic = state.lunatic ? byId(state, state.lunatic.playerId) : null;
  const demon = state.players.find((p) => teamOf(p.role) === "demon");
  if (!lunatic) return "";
  if (!state.lunaticReport || state.lunaticReport.delivered) {
    const identity = `${lunatic.name} is the Lunatic.`;
    if (demon && state.time === 0) addNote(demon, identity);
    return state.time === 0 ? identity : "";
  }
  if (state.lunaticReport.hidden) {
    state.lunaticReport.delivered = true;
    const identity = `${lunatic.name} is the Lunatic.`;
    if (demon) addNote(demon, identity);
    return identity;
  }
  state.lunaticReport.delivered = true;
  const names = state.lunaticReport.ids.map((id) => byId(state, id)?.name).filter(Boolean);
  const chose = names.length ? names.join(" and ") : "nobody";
  const text = `${lunatic.name} is the Lunatic. Tonight they chose ${chose}.`;
  if (demon) addNote(demon, text);
  return text;
}

export function finishNightBookkeeping(state) {
  if (state.time === 0 && state.lunaticReport && !state.lunaticReport.delivered && !state.demonSuppressed) {
    const text = deliverLunaticText(state);
    const demon = state.players.find((p) => teamOf(p.role) === "demon" && p.isHuman);
    if (demon && text) state.pending = ack(demon, "A quiet word", text);
  }
}

function resolveStep(state, pending, choice) {
  if (pending.step === "info") return null;
  const actor = byId(state, pending.actorId);
  switch (pending.step) {
    case "sailor":
      resolveSailor(state, actor, choice);
      break;
    case "chambermaid":
      return resolveChambermaid(state, actor, choice);
    case "innkeeper":
      resolveInnkeeper(state, actor, choice);
      break;
    case "devilsadvocate":
      resolveAdvocate(state, actor, choice);
      break;
    case "exorcist":
      resolveExorcist(state, actor, choice);
      break;
    case "gambler":
      resolveGambler(state, actor, choice);
      break;
    case "courtier":
      resolveCourtier(state, actor, choice);
      break;
    case "professor":
      resolveProfessor(state, actor, choice);
      break;
    case "assassin":
      resolveAssassin(state, actor, choice);
      break;
    case "godfather":
      resolveGodfather(state, actor, choice);
      break;
    case "lunatic":
      resolveLunatic(state, actor, choice);
      break;
    case "pukka":
      applyPukka(state, actor, choice.ids?.[0] ?? null);
      break;
    case "zombuul":
      applyZombuul(state, actor, choice.ids?.[0] ?? null);
      break;
    case "shabaloth":
      applyShabaloth(state, actor, choice.ids || []);
      break;
    case "po":
      applyPo(state, actor, choice.ids || []);
      break;
    default:
      break;
  }
  return null;
}

function chosenIds(choice) {
  if (!choice || choice.pass) return [];
  return choice.ids || [];
}

function resolveSailor(state, actor, choice) {
  const target = byId(state, chosenIds(choice)[0]);
  if (!target) return;
  if (isImpaired(state, actor)) {
    chronicle(state, `${actor.name} the Sailor is impaired and changes nothing.`);
    return;
  }
  if (tripGoon(state, actor, [target.id])) return;
  let drunk = target;
  if (target.id === actor.id || nextRand(state) < 0.34) drunk = actor;
  markDrunk(state, drunk, state.time + 2, "sailor");
  actor.memory.visited = target.id;
  chronicle(state, `Sailor makes ${drunk.name} drunk until dusk.`);
  if (actor.isHuman) addNote(actor, target.id === actor.id
    ? "You chose yourself."
    : `You chose ${target.name}.`);
}

function resolveChambermaid(state, actor, choice) {
  const ids = chosenIds(choice);
  let count = ids.filter((id) => state.woke.includes(id)).length;
  const tripped = !isImpaired(state, actor) && tripGoon(state, actor, ids);
  if (isImpaired(state, actor) || tripped) {
    const lie = count === 0 ? 1 : count === 2 ? 1 : (nextRand(state) < 0.5 ? 0 : 2);
    count = lie;
  }
  const names = ids.map((id) => byId(state, id)?.name).filter(Boolean).join(" and ");
  const text = `Of ${names}, ${count} woke tonight for their own ability.`;
  addNote(actor, text);
  actor.memory.reads = actor.memory.reads || [];
  actor.memory.reads.push({ ids, count, time: state.time });
  chronicle(state, `${actor.name} (Chambermaid) learned ${count}.`);
  if (actor.isHuman) return ack(actor, "Chambermaid", text);
  return null;
}

function resolveInnkeeper(state, actor, choice) {
  const ids = chosenIds(choice).map((id) => byId(state, id)).filter(Boolean);
  if (isImpaired(state, actor)) return;
  if (tripGoon(state, actor, ids.map((p) => p.id))) return;
  for (const player of ids) {
    player.protections.push({ kind: "innkeeper", night: state.time });
  }
  if (ids.length) {
    const drunk = ids[nextRand(state) < 0.5 ? 0 : Math.min(1, ids.length - 1)];
    markDrunk(state, drunk, state.time + 2, "innkeeper");
    chronicle(state, `Innkeeper protects ${ids.map((p) => p.name).join(" and ")}; ${drunk.name} is drunk until dusk.`);
  }
}

function resolveAdvocate(state, actor, choice) {
  const target = byId(state, chosenIds(choice)[0]);
  if (!target) return;
  actor.memory.daLast = target.id;
  if (isImpaired(state, actor)) return;
  if (tripGoon(state, actor, [target.id])) return;
  target.protections.push({ kind: "da", day: state.time + 1 });
  chronicle(state, `Devil's Advocate shields ${target.name} from tomorrow's execution.`);
}

function resolveExorcist(state, actor, choice) {
  const target = byId(state, chosenIds(choice)[0]);
  if (!target) return;
  actor.memory.exLast = target.id;
  if (isImpaired(state, actor)) return;
  if (tripGoon(state, actor, [target.id])) return;
  if (teamOf(target.role) === "demon") {
    state.demonSuppressed = true;
    state.exorcistId = actor.id;
    chronicle(state, `Exorcist ${actor.name} silences the Demon.`);
    addNote(target, `${actor.name} is the Exorcist. You do not wake tonight.`);
  }
}

function resolveGambler(state, actor, choice) {
  const target = byId(state, choice.id);
  if (!target || !choice.role) return;
  if (isImpaired(state, actor)) {
    chronicle(state, `${actor.name} gambled while impaired and does not die for it.`);
    return;
  }
  if (tripGoon(state, actor, [target.id])) return;
  const correct = target.role === choice.role;
  chronicle(state, `${actor.name} gambled that ${target.name} is ${roleName(choice.role)} (${correct ? "right" : "wrong"}).`);
  if (!correct) tryKill(state, actor.id, "gambler");
}

function resolveCourtier(state, actor, choice) {
  if (!choice || choice.pass || !choice.role) return;
  actor.memory.courtierUsed = true;
  if (isImpaired(state, actor)) {
    chronicle(state, "Courtier is impaired. The named character is not made drunk.");
    return;
  }
  state.effects.courtier = { role: choice.role, until: state.time + 6 };
  chronicle(state, `Courtier names ${roleName(choice.role)} drunk for three nights and three days.`);
  if (actor.isHuman) addNote(actor, `You named the ${roleName(choice.role)}.`);
}

function resolveProfessor(state, actor, choice) {
  if (!choice || choice.pass) return;
  const target = byId(state, chosenIds(choice)[0]);
  actor.memory.professorUsed = true;
  if (!target) return;
  if (isImpaired(state, actor) || tripGoon(state, actor, [target.id])) {
    chronicle(state, "Professor is impaired. Nobody returns.");
    return;
  }
  if (!target.alive && teamOf(target.role) === "townsfolk") {
    revive(state, target, "professor");
    if (actor.isHuman) addNote(actor, `${target.name} stirs.`);
  } else {
    chronicle(state, `Professor chose ${target.name}, who does not return.`);
    if (actor.isHuman) addNote(actor, "Nothing happens.");
  }
}

function resolveAssassin(state, actor, choice) {
  if (!choice || choice.pass) return;
  const target = byId(state, chosenIds(choice)[0]);
  actor.memory.assassinUsed = true;
  if (!target) return;
  if (isImpaired(state, actor) || tripGoon(state, actor, [target.id])) {
    chronicle(state, "Assassin is impaired. The strike fails.");
    return;
  }
  tryKill(state, target.id, "assassin", { bypass: true });
}

function resolveGodfather(state, actor, choice) {
  const target = byId(state, chosenIds(choice)[0]);
  if (!target) return;
  if (isImpaired(state, actor) || tripGoon(state, actor, [target.id])) return;
  tryKill(state, target.id, "godfather");
}

function resolveLunatic(state, actor, choice) {
  const ids = chosenIds(choice);
  if (actor.perceivedRole === "po") actor.memory.poMustTriple = ids.length === 0;
  const sober = !isImpaired(state, actor);
  const tripped = sober && tripGoon(state, actor, ids);
  const hidden = !sober || tripped;
  state.lunaticReport = { ids, delivered: hidden, hidden };
  const names = ids.map((id) => byId(state, id)?.name).filter(Boolean);
  addNote(actor, names.length ? `You chose ${names.join(" and ")}.` : "You chose nobody.");
  chronicle(state, `Lunatic ${actor.name} chose ${names.join(", ") || "nobody"}${hidden ? " (Demon is not told)." : "."}`);
}

export function applyPukka(state, actor, targetId) {
  if (!actor) return;
  const target = targetId != null ? byId(state, targetId) : null;
  const sober = !isImpaired(state, actor);
  const tripped = sober && target && tripGoon(state, actor, [target.id]);
  if (sober && !tripped) {
    const prev = state.effects.pukkaVictim != null ? byId(state, state.effects.pukkaVictim) : null;
    if (prev) {
      if (prev.alive) tryKill(state, prev.id, "pukka", { demon: true });
      prev.poisoned = false;
      prev.poisonSource = null;
      state.effects.pukkaVictim = null;
    }
    if (target?.alive) {
      target.poisoned = true;
      target.poisonSource = "pukka";
      state.effects.pukkaVictim = target.id;
      target.impairLog.push({ time: state.time, kind: "poisoned" });
      chronicle(state, `Pukka poisons ${target.name}.`);
    }
  } else {
    chronicle(state, "Pukka is impaired. Last night's poison does not take, and no new poison is laid.");
  }
}

function rememberTough(actor, target, result) {
  if (!actor || !target) return;
  actor.memory.hardToKill = actor.memory.hardToKill || [];
  const lived = target.alive;
  if (lived && !actor.memory.hardToKill.includes(target.id)) actor.memory.hardToKill.push(target.id);
  if (!lived) actor.memory.hardToKill = actor.memory.hardToKill.filter((id) => id !== target.id);
  return result;
}

export function applyZombuul(state, actor, targetId) {
  const target = byId(state, targetId);
  if (!actor || !target) return;
  if (isImpaired(state, actor) || tripGoon(state, actor, [target.id])) {
    chronicle(state, "Zombuul is impaired and does not kill.");
    rememberTough(actor, target, null);
    return;
  }
  const result = tryKill(state, target.id, "zombuul", { demon: true });
  rememberTough(actor, target, result);
}

export function applyShabaloth(state, actor, targetIds) {
  if (!actor) return;
  const soberStart = !isImpaired(state, actor);
  if (soberStart) maybeRegurgitate(state, actor);
  const tripped = soberStart && tripGoon(state, actor, targetIds);
  const killed = [];
  if (soberStart && !tripped && !isImpaired(state, actor)) {
    for (const id of targetIds) {
      const before = byId(state, id)?.alive;
      const result = tryKill(state, id, "shabaloth", { demon: true, holdWin: true });
      if (before && result.killed) killed.push(id);
    }
    actor.memory.lastKills = killed;
    checkWin(state);
  } else chronicle(state, "Shabaloth is impaired and does not kill.");
}

/** Test hook: pass a rand() in [0,1). Default chance to cough a corpse back up is about one in three. */
export function maybeRegurgitate(state, actor, rand = () => nextRand(state)) {
  if ((state.daysSinceDrop || 0) >= 3) return null;
  const last = actor.memory.lastKills || [];
  const corpses = last.map((id) => byId(state, id)).filter((p) => p && !p.alive);
  if (!corpses.length) return null;
  if (rand() > 0.34) return null;
  const index = Math.min(corpses.length - 1, Math.floor(rand() * corpses.length));
  const chosen = corpses[index];
  revive(state, chosen, "shabaloth");
  return chosen;
}

export function applyPo(state, actor, targetIds) {
  if (!actor) return;
  const ids = targetIds || [];
  const sober = !isImpaired(state, actor);
  const tripped = sober && tripGoon(state, actor, ids);
  if (sober && !tripped) {
    for (const id of ids) tryKill(state, id, "po", { demon: true, holdWin: true });
    checkWin(state);
  } else chronicle(state, "Po is impaired and does not kill.");
  actor.memory.poMustTriple = ids.length === 0;
}

export function resolveGossip(state) {
  const gossip = state.gossip;
  if (!gossip || gossip.day + 1 !== state.time) return;
  const speaker = byId(state, gossip.speakerId);
  state.gossip = null;
  if (!speaker) return;
  if (isImpaired(state, speaker)) {
    chronicle(state, "Gossip is impaired, so a true statement kills nobody.");
    return;
  }
  if (!gossip.true) {
    chronicle(state, "Gossip's public statement was false.");
    return;
  }
  const alive = state.players.filter((p) => p.alive);
  if (!alive.length) return;
  const demon = alive.find((p) => teamOf(p.role) === "demon");
  let pool = alive.filter((p) => p.id !== speaker.id);
  if (!pool.length) pool = alive;
  if (demon && pool.length > 1 && nextRand(state) < 0.85) pool = pool.filter((p) => p.id !== demon.id);
  const target = pool[Math.floor(nextRand(state) * pool.length)];
  chronicle(state, "Gossip's statement was true. A player dies.");
  tryKill(state, target.id, "gossip");
}

export function resolveTinker(state) {
  const tinker = findRole(state, "tinker");
  if (!tinker || !tinker.alive || isImpaired(state, tinker)) return;
  const chance = state.flags?.tinker === "always" ? 1 : state.flags?.tinker === "never" ? 0 : 0.11;
  if (nextRand(state) < chance) {
    chronicle(state, "The Tinker pops.");
    tryKill(state, tinker.id, "tinker");
  }
}

export function setMoonchildChoice(state, moonId, targetId) {
  const moon = byId(state, moonId);
  const target = byId(state, targetId);
  if (!moon || !target) return;
  const wasGood = target.alignment === "good";
  state.effects.moonchild = { moonId, targetId, wasGood, setTime: state.time };
  moon.memory.needsMoonchildChoice = false;
  publicSay(state, `${moon.name} points at ${target.name}.`);
  chronicle(state, `Moonchild ${moon.name} chooses ${target.name} (${wasGood ? "good" : "evil"} at the moment of the choice).`);
}

export function resolveMoonchild(state) {
  const mark = state.effects.moonchild;
  if (!mark || mark.setTime >= state.time) return;
  const moon = byId(state, mark.moonId);
  state.effects.moonchild = null;
  if (!moon || isImpaired(state, moon)) {
    chronicle(state, "Moonchild's curse fails because they are drunk or poisoned tonight.");
    return;
  }
  if (!mark.wasGood) {
    chronicle(state, "Moonchild chose an evil player, so nobody dies from the curse.");
    return;
  }
  tryKill(state, mark.targetId, "moonchild");
}

export function morningLines(state) {
  const lines = [];
  const unique = [...new Set(state.nightDeaths.map((entry) => entry.name))];
  if (!unique.length) lines.push("Dawn is quiet. Nobody died in the night.");
  else if (unique.length === 1) lines.push(`${unique[0]} does not wake.`);
  else lines.push(`${unique.slice(0, -1).join(", ")} and ${unique.at(-1)} do not wake.`);
  for (const id of state.revivalsTonight) {
    const player = byId(state, id);
    if (player?.alive) lines.push(`${player.name} is alive again, to the town's astonishment.`);
  }
  return lines;
}
