import { createState } from "./setup.js";
import { getSelfView } from "./view.js";
import { CHARACTERS, teamOf } from "./characters.js";
import {
  byId,
  publicSay,
  pushFrame,
  phaseLabel,
  dayNumber,
  tryKill,
  checkWin,
  chronicle,
} from "./rules.js";
import {
  prepareNight,
  startNightStep,
  commitNightChoice,
  finishNightBookkeeping,
  morningLines,
} from "./night.js";
import {
  beginNominations,
  nominationTick,
  commitNomination,
  voteTick,
  commitVote,
  concludeDay,
  moonchildPending,
  commitMoonchild,
  maybeDayTinker,
} from "./day.js";
import { botChoice, seedDayConversation, reactToChat, replyToWhisper } from "../ai/bots.js";

export function createGame(options = {}) {
  const state = createState(options);
  const human = state.players.find((p) => p.isHuman) || null;
  const actor = human || state.players[0];
  state.humanId = human?.id ?? null;
  state.deathHistory = [];
  state.lastNightDeaths = 0;
  state.quietNights = 0;
  state.morningTold = false;
  state.pending = {
    kind: "reveal",
    step: "reveal",
    actorId: actor.id,
    title: "A token in your hand",
    text: revealCopy(state, actor),
    view: human ? getSelfView(state, human.id) : null,
  };
  state.phase = "reveal";
  return state;
}

function revealCopy(state, actor) {
  const view = getSelfView(state, actor.id);
  const lines = [
    `You are the ${view.shownName}.`,
    view.feelsEvil ? "You are evil." : "You are good.",
    view.ability,
  ];
  if (view.teammates.length) {
    lines.push(`With you: ${view.teammates.map((card) => `${card.name} the ${card.roleName}`).join("; ")}.`);
  }
  if (view.bluffs.length) lines.push(`Bluffs you can wear: ${view.bluffs.map((card) => card.name).join(", ")}.`);
  if (view.lunaticHint) lines.push(`The Lunatic is ${view.lunaticHint.name}. You will hear who they choose.`);
  if (actor.name === "Luca") lines.push("The moon kept a seat for you.");
  return lines.join(" ");
}

export function submit(state, choice, opts = {}) {
  commit(state, choice);
  return pump(state, opts);
}

function commit(state, choice) {
  const pending = state.pending;
  if (!pending) return;
  state.pending = null;
  if (pending.kind === "reveal" || pending.step === "reveal") {
    state.phase = "night";
    prepareNight(state);
    publicSay(state, "Night falls. Windows go dark around the square.");
    return;
  }
  if (pending.kind === "nominate") {
    commitNomination(state, pending, choice);
    return;
  }
  if (pending.kind === "vote") {
    commitVote(state, pending, choice);
    return;
  }
  if (pending.kind === "moonchild") {
    commitMoonchild(state, pending, choice);
    if (state.phase === "moonchild") goToNight(state);
    return;
  }
  commitNightChoice(state, pending, normalize(choice));
}

function normalize(choice) {
  return choice || { pass: true, ids: [], ok: true };
}

export function pump(state, opts = {}) {
  let guard = 0;
  let lastSig = "";
  let repeats = 0;
  while (guard++ < 8000) {
    const sig = `${state.phase}|${state.time}|${state.nightIndex}|${state.nomCursor}|${state.ballot?.index ?? "-"}|${state.pending?.step || state.pending?.kind || "-"}|${state.pending?.actorId ?? "-"}`;
    if (sig === lastSig) {
      if (++repeats > 12) {
        const error = new Error(`Storyteller looped (${sig})`);
        error.summary = summarize(state);
        throw error;
      }
    } else repeats = 0;
    lastSig = sig;
    if (state.phase === "end") return state;
    if (state.winner && state.phase !== "night") {
      closeGame(state);
      return state;
    }
    if (state.winner && state.phase === "night") {
      arriveMorning(state);
      return state;
    }
    if (opts.until && opts.until(state)) return state;
    if (state.pending) {
      const actor = byId(state, state.pending.actorId);
      if (actor?.isHuman && !opts.autoHuman) return state;
      const kind = state.pending.kind;
      const choice = botChoice(state, state.pending);
      commit(state, choice);
      if (!opts.auto && !opts.autoHuman && (kind === "vote" || kind === "nominate")) {
        state.beat = true;
        return state;
      }
      continue;
    }
    const signal = step(state, opts);
    if (signal === "pause") return state;
  }
  const error = new Error(`Storyteller stuck in ${state.phase} at time ${state.time}`);
  error.state = summarize(state);
  throw error;
}

function step(state, opts) {
  if (state.phase === "reveal") return "pause";
  if (state.phase === "night") {
    const signal = startNightStep(state);
    if (signal === "pending") return "continue";
    if (signal === "finished") {
      finishNightBookkeeping(state);
      if (state.pending) return "continue";
      arriveMorning(state);
    }
    return "continue";
  }
  if (state.phase === "morning") {
    const moon = moonchildPending(state);
    if (moon) {
      state.pending = moon;
      return "continue";
    }
    beginDay(state);
    return "continue";
  }
  if (state.phase === "day") {
    if (!opts.auto && !opts.autoHuman) return "pause";
    beginNominations(state);
    return "continue";
  }
  if (state.phase === "nominate") {
    nominationTick(state);
    return "continue";
  }
  if (state.phase === "vote") {
    const signal = voteTick(state);
    if (signal === "none") {
      state.phase = "resolve";
      state.ballot = null;
      return "continue";
    }
    if (signal === "beat" && !opts.auto && !opts.autoHuman) return "pause";
    if (signal === "beat") state.beat = false;
    return "continue";
  }
  if (state.phase === "moonchild") {
    goToNight(state);
    return "continue";
  }
  if (state.phase === "resolve") {
    concludeDay(state);
    if (state.winner) return "continue";
    const moon = moonchildPending(state);
    if (moon) {
      state.pending = moon;
      state.phase = "moonchild";
      return "continue";
    }
    goToNight(state);
    return "continue";
  }
  return "pause";
}

function arriveMorning(state) {
  if (state.morningTold) {
    closeGame(state);
    return;
  }
  state.morningTold = true;
  const deaths = new Set(state.nightDeaths.map((entry) => entry.playerId)).size;
  state.lastNightDeaths = deaths;
  state.deathHistory.push(deaths);
  if (deaths === 0) state.quietNights += 1;
  const label = state.time === 0 ? "First night" : `Night ${state.time / 2 + 1}`;
  for (const line of morningLines(state)) publicSay(state, line, { kind: "story" });
  pushFrame(state, label);
  if (state.winner) {
    closeGame(state);
    return;
  }
  state.phase = "morning";
}

function beginDay(state) {
  state.time += 1;
  state.dayDeaths = [];
  state.phase = "day";
  if (state.mastermindActive) state.finalDay = true;
  publicSay(state, `${phaseLabel(state)}. The town gathers in the square.`, { kind: "story" });
  const aliveKey = state.players.filter((p) => p.alive).map((p) => p.id).sort((a, b) => a - b).join(",");
  if (aliveKey === state.stallKey) state.stallDays = (state.stallDays || 0) + 1;
  else {
    state.stallKey = aliveKey;
    state.stallDays = 0;
  }
  const aliveCount = state.players.filter((p) => p.alive).length;
  if (state.bestAlive == null || aliveCount < state.bestAlive) {
    state.bestAlive = aliveCount;
    state.daysSinceDrop = 0;
  } else state.daysSinceDrop = (state.daysSinceDrop || 0) + 1;
  maybeDayTinker(state);
  if (state.winner) return;
  breakStall(state);
  if (state.winner) return;
  seedDayConversation(state);
  if (state.finalDay) {
    publicSay(state, "The air feels thin, as if the tale is almost over.", { kind: "story" });
  }
}

function breakStall(state) {
  if ((state.daysSinceDrop || 0) < 6 || state.mastermindActive || state.winner) return;
  const alive = state.players.filter((p) => p.alive);
  const demon = alive.find((p) => teamOf(p.role) === "demon");
  const evilCount = alive.filter((p) => teamOf(p.role) === "demon" || teamOf(p.role) === "minion" || p.alignment === "evil").length;
  const target = alive.length - evilCount > evilCount
    ? demon
    : alive.find((p) => p !== demon);
  if (!target) return;
  const result = tryKill(state, target.id, "stalemate", { bypass: true, holdWin: true });
  if (result.killed || result.apparent) {
    publicSay(state, `The stalemate breaks. ${target.name} falls.`);
    chronicle(state, "Storyteller ended a stalemate that no longer changed the number of living players.");
  }
  checkWin(state);
}

function goToNight(state) {
  state.time += 1;
  state.phase = "night";
  state.morningTold = false;
  prepareNight(state);
  publicSay(state, "Dusk. Doors shut. The moon climbs.", { kind: "story" });
}

function closeGame(state) {
  if (state.phase !== "end") {
    if (state.winReason) publicSay(state, state.winReason, { kind: "story" });
    else if (state.resigned) publicSay(state, "The grimoire is opened.", { kind: "story" });
    pushFrame(state, "The end");
  }
  state.phase = "end";
  state.pending = null;
  state.beat = false;
}

export function resign(state) {
  state.resigned = true;
  if (!state.winner) state.winReason = "";
  closeGame(state);
  return state;
}

export function autoplay(options = {}) {
  const allBots = options.allBots ?? true;
  const state = createGame({ ...options, allBots });
  pump(state, { auto: true, autoHuman: true });
  if (!state.winner && !state.resigned) {
    const error = new Error("Game did not finish");
    error.summary = summarize(state);
    throw error;
  }
  return state;
}

export function playUntil(state, until, opts = {}) {
  return pump(state, { auto: true, autoHuman: opts.autoHuman !== false, until });
}

export function summarize(state) {
  return {
    phase: state.phase,
    time: state.time,
    day: dayNumber(state),
    winner: state.winner,
    pending: state.pending?.kind || null,
    step: state.pending?.step || state.nightPlan?.[state.nightIndex] || null,
    alive: state.players.filter((p) => p.alive).map((p) => `${p.name}:${CHARACTERS[p.role].name}`),
  };
}

export function callNominations(state) {
  if (state.phase !== "day" || state.winner) return pump(state, {});
  beginNominations(state);
  return pump(state, {});
}

export function sayAloud(state, text) {
  const human = state.players.find((p) => p.isHuman);
  const clean = String(text || "").trim().slice(0, 240);
  if (!human || !clean) return state;
  publicSay(state, clean, { kind: "chat", speakerId: human.id });
  reactToChat(state, human.id, clean);
  return state;
}

export function whisperTo(state, targetId, text) {
  const human = state.players.find((p) => p.isHuman);
  const bot = byId(state, targetId);
  const clean = String(text || "").trim().slice(0, 240);
  if (!human || !bot || bot.isHuman || !clean) return state;
  publicSay(state, clean, { kind: "whisper", speakerId: human.id, toId: bot.id });
  const reply = replyToWhisper(state, bot, human, clean);
  publicSay(state, reply, { kind: "whisper", speakerId: bot.id, toId: human.id });
  return state;
}

export function freshGame(options) {
  return createGame(options);
}
