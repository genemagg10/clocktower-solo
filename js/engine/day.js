import { teamOf } from "./characters.js";
import {
  byId,
  findRole,
  isSociallyAlive,
  isImpaired,
  sociallyAlive,
  tryKill,
  checkWin,
  voteThreshold,
  voteOrder,
  publicSay,
  chronicle,
  addNote,
  dayNumber,
} from "./rules.js";
import { setMoonchildChoice } from "./night.js";
import { roleName } from "./setup.js";
import { nextRand } from "./rng.js";

export function beginNominations(state) {
  state.phase = "nominate";
  state.nomCursor = 0;
  state.nominatedBy = {};
  state.onBlock = null;
  state.ballot = null;
  state.executedId = null;
}

export function legalNominees(state, nominator) {
  return state.players
    .filter((p) => p.id !== nominator.id)
    .map((p) => p.id);
}

export function nominationTick(state) {
  if (state.ballot) {
    state.phase = "vote";
    return "vote";
  }
  const seats = [...state.players].sort((a, b) => a.seat - b.seat);
  while (state.nomCursor < seats.length) {
    const player = seats[state.nomCursor];
    if (!isSociallyAlive(player) || state.nominatedBy[player.id]) {
      state.nomCursor += 1;
      continue;
    }
    state.pending = {
      kind: "nominate",
      step: "nominate",
      actorId: player.id,
      options: legalNominees(state, player),
      allowPass: true,
      title: "Nominations",
      text: `${player.name}, name someone for the town to vote on, or pass.`,
    };
    return "pending";
  }
  state.phase = "resolve";
  return "resolve";
}

export function commitNomination(state, pending, choice) {
  const actor = byId(state, pending.actorId);
  state.nominatedBy[actor.id] = true;
  state.pending = null;
  if (!choice || choice.pass || choice.nomineeId == null) {
    state.nomCursor += 1;
    return;
  }
  const nominee = byId(state, choice.nomineeId);
  if (!nominee || nominee.id === actor.id) {
    state.nomCursor += 1;
    return;
  }
  state.ballot = {
    nominatorId: actor.id,
    nomineeId: nominee.id,
    order: voteOrder(state, nominee.id),
    index: 0,
    votes: {},
  };
  state.phase = "vote";
  publicSay(state, `${actor.name} nominates ${nominee.name}.`, { kind: "vote" });
}

export function voteTick(state) {
  const ballot = state.ballot;
  if (!ballot) return "none";
  if (ballot.index >= ballot.order.length) {
    closeBallot(state);
    return "closed";
  }
  const voter = byId(state, ballot.order[ballot.index]);
  if (!isSociallyAlive(voter) && !voter.ghostVote) {
    ballot.votes[voter.id] = false;
    ballot.index += 1;
    state.beat = true;
    return "beat";
  }
  const need = voteThreshold(state);
  const yes = Object.values(ballot.votes).filter(Boolean).length;
  const ghost = !isSociallyAlive(voter);
  state.pending = {
    kind: "vote",
    step: "vote",
    actorId: voter.id,
    nomineeId: ballot.nomineeId,
    title: ghost ? "Ghost vote" : "Vote",
    text: ghost
      ? `${voter.name}, spend your one ghost vote on ${byId(state, ballot.nomineeId).name}?`
      : `${voter.name}, raise a hand against ${byId(state, ballot.nomineeId).name}? ${yes} hands so far, ${need} to put them on the block.`,
    tally: yes,
    need,
  };
  return "pending";
}

export function commitVote(state, pending, choice) {
  const ballot = state.ballot;
  const voter = byId(state, pending.actorId);
  const yes = !!(choice && choice.yes);
  if (yes && !isSociallyAlive(voter)) {
    if (voter.ghostVote) voter.ghostVote = false;
    else {
      ballot.votes[voter.id] = false;
      ballot.index += 1;
      state.pending = null;
      state.beat = true;
      return;
    }
  }
  ballot.votes[voter.id] = yes;
  ballot.index += 1;
  state.pending = null;
  state.beat = true;
}

function closeBallot(state) {
  const ballot = state.ballot;
  const yes = Object.values(ballot.votes).filter(Boolean).length;
  const need = voteThreshold(state);
  const nominee = byId(state, ballot.nomineeId);
  let takes = false;
  if (state.onBlock) takes = yes > state.onBlock.tally;
  else takes = yes >= need;
  if (takes) state.onBlock = { playerId: nominee.id, tally: yes };
  const hands = Object.entries(ballot.votes).filter(([, voted]) => voted).map(([id]) => byId(state, Number(id))?.name);
  publicSay(state,
    takes
      ? `${yes} hand${yes === 1 ? "" : "s"} for ${nominee.name}. They are on the block.`
      : `${yes} hand${yes === 1 ? "" : "s"} for ${nominee.name}. It is not enough.`,
    { kind: "vote" });
  const livingIds = sociallyAlive(state).map((p) => p.id);
  if (livingIds.length > 0 && livingIds.every((id) => ballot.votes[id])) {
    publicSay(state, "Every living hand in the square goes up as one.", { kind: "story" });
  }
  chronicle(state, `Vote on ${nominee.name}: ${yes}/${need}${hands.length ? ` (${hands.join(", ")})` : ""}. ${takes ? "On the block." : "Not enough."}`);
  state.ballot = null;
  state.nomCursor += 1;
  state.phase = "nominate";
}

export function concludeDay(state) {
  const block = state.onBlock;
  state.onBlock = null;
  state.phase = "resolve";
  if (state.finalDay) {
    const executed = block ? byId(state, block.playerId) : null;
    if (executed?.alive) {
      const result = tryKill(state, executed.id, "execution", { holdWin: true });
      announceExecution(state, executed, result);
    } else if (executed) {
      publicSay(state, `The town executes ${executed.name}, who is already gone.`);
    }
    const team = executed ? executed.alignment : null;
    if (!executed) {
      state.winner = "good";
      state.winReason = "The last day ends with no execution. Good wins.";
    } else if (team === "good") {
      state.winner = "evil";
      state.winReason = `${executed.name} was executed on the final day. Evil wins.`;
    } else {
      state.winner = "good";
      state.winReason = `${executed.name} was executed on the final day. Good wins.`;
    }
    state.mastermindActive = false;
    chronicle(state, state.winReason);
    return;
  }

  if (!block) {
    publicSay(state, "The town executes nobody.");
    chronicle(state, "No execution.");
    checkWin(state);
    return;
  }
  const player = byId(state, block.playerId);
  state.executedId = player.id;
  if (!player.alive) {
    publicSay(state, `The town executes ${player.name}, who is already gone.`);
    chronicle(state, `Executed a dead player: ${player.name}.`);
    checkWin(state);
    return;
  }
  const result = tryKill(state, player.id, "execution", { holdWin: true });
  announceExecution(state, player, result);
  if (!result.killed && !result.apparent && player.alive) {
    state.hardened = state.hardened || [];
    if (!state.hardened.includes(player.id)) state.hardened.push(player.id);
  }
  if (result.killed && teamOf(player.role) === "demon") {
    const mind = findRole(state, "mastermind");
    if (mind && mind.alive && !isImpaired(state, mind)) {
      state.mastermindActive = true;
      chronicle(state, "Mastermind: the Demon died by execution, so the game continues one more night and one more day.");
      addNote(player, "You died, yet the tale refuses to end. Someone planned for this.");
      if (mind.id !== player.id) addNote(mind, "Your plan catches. There will be one more day.");
      return;
    }
  }
  checkWin(state);
}

function announceExecution(state, player, result) {
  if (result.apparent) {
    publicSay(state, `${player.name} is executed.`);
    if (player.isHuman) addNote(player, "The shroud is a costume. You are still alive. Act dead.");
    return;
  }
  if (result.killed) {
    publicSay(state, `${player.name} is executed and dies.`);
    return;
  }
  publicSay(state, `${player.name} is executed, but does not die.`);
}

export function moonchildPending(state) {
  if (state.winner) return null;
  const moon = state.players.find((p) => p.memory.needsMoonchildChoice);
  if (!moon) return null;
  const options = sociallyAlive(state).map((p) => p.id);
  if (!options.length) {
    moon.memory.needsMoonchildChoice = false;
    return null;
  }
  return {
    kind: "moonchild",
    step: "moonchild",
    actorId: moon.id,
    options,
    title: "Moonchild",
    text: `${moon.name} has died and must point at a living player.`,
    public: true,
  };
}

export function commitMoonchild(state, pending, choice) {
  const id = choice?.id ?? choice?.ids?.[0];
  if (id == null) return;
  setMoonchildChoice(state, pending.actorId, id);
  state.pending = null;
}

export function offerGossip(state, actor) {
  if (!actor || actor.role !== "gossip" || !actor.alive) return null;
  if (state.gossip && state.gossip.day === state.time) return null;
  return {
    kind: "gossip",
    step: "gossip",
    actorId: actor.id,
    title: "Gossip",
    text: "You may make one public statement. If it is true, someone dies tonight.",
    playerOptions: state.players.filter((p) => p.id !== actor.id).map((p) => p.id),
    claimTypes: ["good", "evil", "townsfolk", "outsider", "minion", "demon", "role"],
    roleOptions: null,
  };
}

export function judgeClaim(state, claim) {
  const target = byId(state, claim.targetId);
  if (!target) return false;
  if (claim.type === "good") return target.alignment === "good";
  if (claim.type === "evil") return target.alignment === "evil";
  if (claim.type === "townsfolk" || claim.type === "outsider" || claim.type === "minion" || claim.type === "demon") {
    return teamOf(target.role) === claim.type;
  }
  if (claim.type === "role") return target.role === claim.role;
  return false;
}

export function declareGossip(state, actor, claim) {
  if (!actor || actor.role !== "gossip") return;
  const truth = judgeClaim(state, claim);
  const target = byId(state, claim.targetId);
  const text = gossipSentence(target, claim);
  state.gossip = { speakerId: actor.id, day: state.time, true: truth, text };
  publicSay(state, `${actor.name} says: “${text}”`, { kind: "chat", speakerId: actor.id });
  chronicle(state, `Gossip statement ${truth ? "true" : "false"}: ${text}`);
}

function gossipSentence(target, claim) {
  if (!target) return "Someone is not who they seem.";
  if (claim.type === "good") return `${target.name} is good.`;
  if (claim.type === "evil") return `${target.name} is evil.`;
  if (claim.type === "role") return `${target.name} is the ${roleName(claim.role)}.`;
  const label = claim.type === "townsfolk" ? "Townsfolk" : claim.type === "outsider" ? "Outsider" : claim.type === "minion" ? "Minion" : "Demon";
  return `${target.name} is a ${label}.`;
}

export function maybeDayTinker(state) {
  const tinker = findRole(state, "tinker");
  if (!tinker || !tinker.alive || isImpaired(state, tinker)) return;
  const chance = state.flags?.tinker === "always" ? 1 : state.flags?.tinker === "never" ? 0 : 0.05;
  if (nextRand(state) < chance) {
    const result = tryKill(state, tinker.id, "tinker-day");
    if (result.killed || result.apparent) publicSay(state, `${tinker.name} drops where they stand.`);
  }
}

export function dayLabel(state) {
  return `Day ${dayNumber(state)}`;
}
