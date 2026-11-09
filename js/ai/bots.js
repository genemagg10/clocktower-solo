import { CHARACTERS, CHARACTER_LIST, teamOf } from "../engine/characters.js";
import { nextRand, randInt, shuffle } from "../engine/rng.js";
import { byId, dayNumber, isSociallyAlive, publicSay } from "../engine/rules.js";
import { declareGossip, judgeClaim } from "../engine/day.js";
import { roleName } from "../engine/setup.js";

function matesOf(player) {
  if (!player?.brief?.teammates) return new Set();
  if (player.role === "lunatic" || teamOf(player.role) === "demon" || teamOf(player.role) === "minion") {
    return new Set(player.brief.teammates.map((card) => card.id));
  }
  return new Set();
}

function feelsEvil(player) {
  return player.role === "lunatic" || teamOf(player.role) === "demon" || teamOf(player.role) === "minion";
}

export function suspicion(state, bot, target) {
  if (!target || target.id === bot.id) return -100;
  if (matesOf(bot).has(target.id)) return -45;
  if (bot.brief?.lunaticId === target.id) return 8;
  let score = 44;
  const claims = state.claims.filter((claim) => claim.speakerId === target.id);
  if (claims.length) {
    score -= 7;
    const role = claims[claims.length - 1].role;
    if (state.claims.some((claim) => claim.role === role && claim.speakerId !== target.id)) score += 26;
  } else if (dayNumber(state) >= 2) score += 9;
  if (bot.memory.grandchild?.id === target.id) score -= 30;
  for (const read of bot.memory.reads || []) {
    if (!read.ids?.includes(target.id)) continue;
    score += read.count > 0 ? 7 : -6;
  }
  if (!isSociallyAlive(target)) {
    score -= 12;
    if (dayNumber(state) >= 2 && bot.personality?.id === "skeptic") score += 22;
  }
  score += ((bot.id * 13 + target.id * 5 + dayNumber(state) * 3) % 7) - 3;
  return score;
}

function ranked(state, bot, ids) {
  return ids
    .map((id) => byId(state, id))
    .filter(Boolean)
    .map((player) => ({ player, score: suspicion(state, bot, player) }))
    .sort((a, b) => b.score - a.score);
}

export function botChoice(state, pending) {
  const actor = byId(state, pending.actorId);
  if (!actor) return { ok: true, pass: true };
  switch (pending.kind) {
    case "reveal":
    case "ack":
      return { ok: true };
    case "players":
      return choosePlayers(state, actor, pending);
    case "gambler":
      return chooseGamble(state, actor, pending);
    case "role":
      return chooseRole(state, actor, pending);
    case "nominate":
      return chooseNomination(state, actor, pending);
    case "vote":
      return { yes: chooseVote(state, actor, pending) };
    case "moonchild":
      return { id: chooseMoonchild(state, actor, pending) };
    default:
      return { ok: true, pass: true };
  }
}

function choosePlayers(state, actor, pending) {
  if (pending.allowPass && shouldPass(state, actor, pending)) return { pass: true };
  if (pending.step === "po" || (pending.step === "lunatic" && actor.perceivedRole === "po")) {
    if (!actor.memory.poMustTriple && pending.allowZero && sociallyCount(state) >= 7 && dayNumber(state) < 2 && nextRand(state) < 0.75) {
      return { ids: [] };
    }
  }
  const count = pending.allowZero && pending.min === 0 ? Math.max(pending.min, pending.max) : pending.max;
  let ids = pickIds(state, actor, pending, count);
  if (pending.allowZero && ids.length === 0) return { ids: [] };
  if (ids.length < pending.min) ids = shuffle(state, pending.options).slice(0, pending.min);
  return { ids: ids.slice(0, pending.max) };
}

function shouldPass(state, actor, pending) {
  if (pending.step === "assassin") return dayNumber(state) < 2 && sociallyCount(state) > 6 && nextRand(state) < 0.8;
  if (pending.step === "professor") {
    const promising = (pending.options || []).some((id) => {
      const claim = state.claims.find((item) => item.speakerId === id);
      return claim && CHARACTERS[claim.role]?.team === "townsfolk";
    });
    return !promising && dayNumber(state) < 3;
  }
  if (pending.step === "courtier") return dayNumber(state) < 2;
  return false;
}

function pickIds(state, actor, pending, count) {
  const options = pending.options || [];
  if (pending.step === "innkeeper") {
    const others = ranked(state, actor, options.filter((id) => id !== actor.id));
    const ally = [...others].sort((a, b) => a.score - b.score)[0];
    const ids = [];
    if (options.includes(actor.id)) ids.push(actor.id);
    if (ally && !ids.includes(ally.player.id)) ids.push(ally.player.id);
    while (ids.length < count) {
      const next = options.find((id) => !ids.includes(id));
      if (next == null) break;
      ids.push(next);
    }
    return ids.slice(0, count);
  }
  if (pending.step === "devilsadvocate") {
    const demon = actor.brief?.teammates?.find((card) => CHARACTERS[card.role]?.team === "demon");
    if (demon && options.includes(demon.id)) return [demon.id];
    if (options.includes(actor.id)) return [actor.id];
  }
  if (pending.step === "sailor") {
    const best = ranked(state, actor, options.filter((id) => id !== actor.id))[0];
    if (best) return [best.player.id];
  }
  if (pending.step === "chambermaid" || pending.step === "exorcist" || pending.step === "godfather") {
    return ranked(state, actor, options).slice(0, count).map((row) => row.player.id);
  }
  if (pending.step === "assassin") {
    const pool = ranked(state, actor, options.filter((id) => !matesOf(actor).has(id) && id !== actor.id));
    const trusted = [...pool].sort((a, b) => a.score - b.score)[0];
    if (trusted) return [trusted.player.id];
  }
  if (pending.step === "professor") {
    const claimed = options.find((id) => state.claims.some((claim) => claim.speakerId === id && CHARACTERS[claim.role]?.team === "townsfolk"));
    return [claimed ?? options[0]];
  }
  if (["pukka", "zombuul", "shabaloth", "po", "lunatic"].includes(pending.step)) {
    const avoid = new Set([...matesOf(actor), actor.id]);
    if (actor.brief?.lunaticId != null && nextRand(state) < 0.65) avoid.add(actor.brief.lunaticId);
    const tough = actor.memory.hardToKill || [];
    let pool = options.filter((id) => !avoid.has(id) && !tough.includes(id));
    if (pool.length < count) pool = options.filter((id) => !avoid.has(id));
    if (pool.length < count) pool = options.filter((id) => id !== actor.id);
    if (pool.length < count) pool = options;
    return ranked(state, actor, pool).slice(0, count).map((row) => row.player.id);
  }
  return ranked(state, actor, options).slice(0, count).map((row) => row.player.id);
}

function chooseGamble(state, actor, pending) {
  if ((actor.personality?.bold ?? 0.5) < 0.35 && nextRand(state) < 0.65) {
    return { id: actor.id, role: actor.role };
  }
  const pool = pending.playerOptions.filter((id) => id !== actor.id);
  const top = ranked(state, actor, pool)[0];
  const targetId = top ? top.player.id : actor.id;
  const claim = state.claims.find((item) => item.speakerId === targetId);
  const role = claim?.role || (top && top.score > 60 ? "po" : "fool");
  return { id: targetId, role };
}

function chooseRole(state, actor, pending) {
  if (dayNumber(state) < 2) return { pass: true };
  if ((state.lastNightDeaths || 0) >= 2) return { role: "shabaloth" };
  if ((state.quietNights || 0) > 0 && (state.lastNightDeaths || 0) > 0) return { role: "po" };
  if (dayNumber(state) >= 3) return { role: nextRand(state) < 0.5 ? "pukka" : "zombuul" };
  return { pass: true };
}

function chooseNomination(state, actor, pending) {
  const living = (pending.options || []).filter((id) => isSociallyAlive(byId(state, id)));
  const board = ranked(state, actor, living.length ? living : (pending.options || []));
  const top = board[0];
  if (!top) return { pass: true };
  const day = dayNumber(state);
  const alive = sociallyCount(state);
  const stalled = (state.stallDays || 0) >= 2 || (state.daysSinceDrop || 0) >= 3;
  if (stalled && !state.onBlock) {
    const fresh = (pending.options || []).filter((id) => {
      const person = byId(state, id);
      return person && isSociallyAlive(person) && person.id !== actor.id && !(state.hardened || []).includes(id);
    });
    const topFresh = ranked(state, actor, fresh)[0];
    if (topFresh) return { nomineeId: topFresh.player.id };
    const demon = state.players.find((p) => teamOf(p.role) === "demon" && p.alive && p.id !== actor.id && isSociallyAlive(p));
    if (demon) return { nomineeId: demon.id };
    return { pass: true };
  }
  const urgent = (day >= 2 || alive <= 4) && !state.onBlock;
  if (((state.stallDays || 0) >= 2 || (state.daysSinceDrop || 0) >= 3) && feelsEvil(actor)) {
    const sacrifice = (pending.options || [])
      .map((id) => byId(state, id))
      .find((p) => p && isSociallyAlive(p) && (teamOf(p.role) === "minion" || teamOf(p.role) === "demon") && p.id !== actor.id);
    if (sacrifice) return { nomineeId: sacrifice.id };
  }
  if (alive <= 4 && !state.onBlock) return { nomineeId: top.player.id };
  if (top.score >= 60 || (urgent && top.score >= 46) || (day >= 4 && !state.onBlock)) {
    return { nomineeId: top.player.id };
  }
  if ((actor.personality?.bold ?? 0.5) > 0.6 && top.score >= 48) return { nomineeId: top.player.id };
  if (nextRand(state) < 0.42 && top.score >= 42) return { nomineeId: top.player.id };
  return { pass: true };
}

function chooseVote(state, actor, pending) {
  const nominee = byId(state, pending.nomineeId);
  if (!nominee) return false;
  const score = suspicion(state, actor, nominee);
  if (nominee.id === actor.id) return false;
  if (((state.stallDays || 0) >= 3 || (state.daysSinceDrop || 0) >= 4) && (teamOf(nominee.role) === "minion" || teamOf(nominee.role) === "demon")) return true;
  if (matesOf(actor).has(nominee.id)) {
    if ((state.stallDays || 0) >= 2 && teamOf(nominee.role) === "minion") return true;
    return false;
  }
  const day = dayNumber(state);
  const tally = pending.tally || 0;
  const need = pending.need || 1;
  const alive = sociallyCount(state);
  let yes = false;
  if (nominee.id !== actor.id && alive <= 4 && score > 10) yes = true;
  else if (score >= 62) yes = true;
  else if (score >= 48 && (tally + 1 >= need || day >= 2)) yes = true;
  else if (day >= 4 && score >= 36) yes = true;
  else if ((actor.personality?.herd ?? 0) > 0.65 && tally + 1 >= need && score >= 34) yes = true;
  if (!yes) return false;
  if (!isSociallyAlive(actor)) {
    const pivotal = tally < need && tally + 1 >= need;
    return score >= 74 || pivotal;
  }
  return true;
}

function chooseMoonchild(state, actor, pending) {
  const board = ranked(state, actor, pending.options || []);
  if (!board.length) return pending.options?.[0];
  if ((actor.personality?.bold ?? 0.5) > 0.62) return board[0].player.id;
  return board[board.length - 1].player.id;
}

function sociallyCount(state) {
  return state.players.filter(isSociallyAlive).length;
}

const HUNCHES = [
  (name) => `${name} has been quiet in a way I don't love.`,
  (name) => `I keep looking at ${name}.`,
  (name) => `If we execute today, I want it to mean something. My eye is on ${name}.`,
  (name) => `Don't pile on ${name} just because they're loud.`,
  (name) => `The deaths have a shape. I'm not ready to shout a name, but ${name} doesn't fit their story.`,
];

export function seedDayConversation(state) {
  const day = dayNumber(state);
  const alive = shuffle(state, state.players.filter((p) => isSociallyAlive(p) && !p.isHuman));
  if ((state.lastNightDeaths || 0) === 0 && day > 1) {
    publicSay(state, "A quiet night. That could be a Zombuul hiding, or a Po gathering strength.", { kind: "chat", speakerId: alive[0]?.id });
  } else if ((state.lastNightDeaths || 0) >= 2) {
    publicSay(state, "Two people gone at once. That smells like a Shabaloth — or a Po who was ready.", { kind: "chat", speakerId: alive[0]?.id });
  }
  let spoken = 0;
  for (const bot of alive) {
    if (spoken >= 5) break;
    if (nextRand(state) > (bot.personality?.talk ?? 0.5) + 0.25) continue;
    if (!state.claims.some((claim) => claim.speakerId === bot.id)) {
      const role = claimRoleFor(state, bot);
      if (role) {
        state.claims.push({ speakerId: bot.id, role, day: state.time });
        const lie = role !== bot.role;
        publicSay(state, `I'm the ${roleName(role)}.`, { kind: "chat", speakerId: bot.id });
        if (lie && bot.role !== "lunatic" && !feelsEvil(bot)) {
          chronicleSoft(state, `${bot.name} told a fib about their role.`);
        }
        spoken += 1;
      }
    }
    sharePrivate(state, bot);
    if (bot.role === "gossip") botGossip(state, bot);
    spoken += 1;
  }
  const human = state.players.find((p) => p.isHuman);
  if (human && day === 1) {
    const friend = state.players.find((p) => !p.isHuman && matesOf(p).has(human.id) && feelsEvil(p));
    if (friend) {
      publicSay(state, "Psst. It's me. We're together. Don't sell us out in the square.", {
        kind: "whisper", speakerId: friend.id, toId: human.id,
      });
    }
  }
}

function chronicleSoft(state, text) {
  state.chronicle.push({ time: state.time, text });
}

function claimRoleFor(state, bot) {
  if (feelsEvil(bot)) return bot.memory.bluffRole || "fool";
  if (bot.personality?.id === "spark" && nextRand(state) < 0.28) {
    const lie = shuffle(state, ["sailor", "grandmother", "fool", "pacifist", "tealady"]).find((role) => role !== bot.role);
    return lie || bot.role;
  }
  return bot.role;
}

function sharePrivate(state, bot) {
  if ((bot.personality?.honest ?? 1) < 0.5) return;
  if (bot.memory.grandchild && !bot.memory.sharedGrandchild) {
    const who = byId(state, bot.memory.grandchild.id);
    if (who) {
      bot.memory.sharedGrandchild = true;
      publicSay(state, `I woke knowing a good soul: ${who.name}, the ${roleName(bot.memory.grandchild.role)}.`, {
        kind: "chat", speakerId: bot.id,
      });
    }
  }
  const read = (bot.memory.reads || []).at(-1);
  if (read && read.time === state.time - 1 && !read.shared) {
    read.shared = true;
    const names = read.ids.map((id) => byId(state, id)?.name).filter(Boolean).join(" and ");
    publicSay(state, `I checked ${names}. ${read.count} of them woke for an ability.`, { kind: "chat", speakerId: bot.id });
  }
  if (bot.memory.visited && nextRand(state) < 0.4) {
    const who = byId(state, bot.memory.visited);
    if (who) publicSay(state, `I spent the night near ${who.name}.`, { kind: "chat", speakerId: bot.id });
  }
}

function botGossip(state, bot) {
  if (state.gossip?.day === state.time) return;
  const options = state.players.filter((p) => p.id !== bot.id && isSociallyAlive(p));
  const top = ranked(state, bot, options.map((p) => p.id))[0];
  if (!top) return;
  const claimRole = state.claims.find((claim) => claim.speakerId === top.player.id)?.role;
  const claim = claimRole
    ? { type: "role", targetId: top.player.id, role: claimRole }
    : { type: top.score > 58 ? "evil" : "good", targetId: top.player.id };
  declareGossip(state, bot, claim);
}

export function reactToChat(state, fromId, text) {
  const from = byId(state, fromId);
  if (!from) return;
  absorbClaim(state, from, text);
  const mentioned = state.players.find((p) => p.id !== from.id && text.toLowerCase().includes(p.name.toLowerCase()));
  const bots = shuffle(state, state.players.filter((p) => !p.isHuman && isSociallyAlive(p) && p.id !== from.id));
  const bot = bots[0];
  if (!bot) return;
  if (mentioned) {
    const score = suspicion(state, bot, mentioned);
    const line = score > 58
      ? `${mentioned.name} is on my list too.`
      : score < 32
        ? `Leave ${mentioned.name} be. I think they're useful.`
        : `${mentioned.name}? I'm still chewing on that.`;
    publicSay(state, line, { kind: "chat", speakerId: bot.id });
    return;
  }
  if (from.isHuman && nextRand(state) < 0.7) {
    const top = ranked(state, bot, state.players.filter((p) => p.id !== bot.id).map((p) => p.id))[0];
    const hunch = HUNCHES[randInt(state, HUNCHES.length)];
    publicSay(state, hunch(top ? top.player.name : "someone"), { kind: "chat", speakerId: bot.id });
  }
}

function absorbClaim(state, speaker, text) {
  const match = text.match(/i am the ([a-z' -]+)/i);
  if (!match) return;
  const needle = match[1].trim().toLowerCase();
  const role = CHARACTER_LIST.find((c) => c.name.toLowerCase() === needle);
  if (!role) return;
  state.claims = state.claims.filter((claim) => !(claim.speakerId === speaker.id && claim.day === state.time));
  state.claims.push({ speakerId: speaker.id, role: role.id, day: state.time });
}

export function replyToWhisper(state, bot, from, text) {
  if (matesOf(bot).has(from.id) && feelsEvil(bot)) {
    return "I'm with you. I'll keep my bluff steady and vote when you need me.";
  }
  if (/minion|demon|our team|i('| a)?m evil|with me/i.test(text) && !feelsEvil(bot)) {
    return "You've got the wrong person. I'm not sitting on that team.";
  }
  const mentioned = state.players.find((p) => text.toLowerCase().includes(p.name.toLowerCase()));
  if (mentioned) {
    const score = suspicion(state, bot, mentioned);
    if (score > 60) return `Between us, I don't trust ${mentioned.name}.`;
    if (score < 34) return `${mentioned.name} has been straight with me.`;
  }
  const lines = [
    "I'll sit with that.",
    "If you believe it, say a piece of it out loud.",
    "My head's noisy, but I heard you.",
    "Not in the square. Not yet.",
  ];
  return lines[randInt(state, lines.length)];
}

export { judgeClaim };
