import { CHARACTERS, TEAM_LABEL } from "./characters.js";
import { byId } from "./rules.js";

/**
 * What a player is allowed to know. The Lunatic's object never includes
 * their real role — that waits for the grimoire.
 */
export function getSelfView(state, playerId) {
  const player = byId(state, playerId);
  if (!player) return null;
  const lunatic = player.role === "lunatic";
  const shownRole = lunatic ? player.perceivedRole : player.role;
  const meta = CHARACTERS[shownRole];
  const alignmentLabel = shownAlignment(player, lunatic, meta);
  const view = {
    playerId: player.id,
    name: player.name,
    shownRole,
    shownName: meta.name,
    shownTeam: meta.team,
    teamLabel: TEAM_LABEL[meta.team],
    ability: meta.ability,
    alignmentLabel,
    feelsEvil: alignmentLabel === "evil",
    teammates: (player.brief?.teammates || []).map((card) => ({
      id: card.id,
      name: card.name,
      role: card.role,
      roleName: CHARACTERS[card.role]?.name || card.role,
    })),
    bluffs: (player.brief?.bluffs || []).map((role) => ({
      role,
      name: CHARACTERS[role]?.name || role,
    })),
    notes: [...player.notes],
    alive: player.alive,
    registersDead: player.registersDead,
    ghostVote: player.ghostVote,
  };
  const hint = lunaticHintFor(state, player, lunatic);
  if (hint) view.lunaticHint = hint;
  return view;
}

function lunaticHintFor(state, player, lunatic) {
  if (lunatic || player.brief?.lunaticId == null) return null;
  const who = byId(state, player.brief.lunaticId);
  if (!who) return null;
  return { id: who.id, name: who.name };
}

function shownAlignment(player, lunatic, meta) {
  if (lunatic) return "evil";
  if (player.role === "goon") return player.alignment;
  if (meta.team === "minion" || meta.team === "demon") return "evil";
  return "good";
}

export function grimoireRows(state) {
  return state.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      role: player.role,
      roleName: CHARACTERS[player.role].name,
      team: CHARACTERS[player.role].team,
      alignment: player.alignment,
      alive: player.alive,
      registersDead: player.registersDead,
      perceivedRole: player.role === "lunatic" ? player.perceivedRole : null,
      impairLog: player.impairLog,
      isHuman: player.isHuman,
    }));
}
