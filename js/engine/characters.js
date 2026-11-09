/**
 * Bad Moon Rising, told in original words.
 * Night-order numbers follow the official script sheet (lower wakes first).
 * A 0 means that character does not wake in that phase.
 */

export const DISTRIBUTION = {
  5: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  6: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
  7: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
  8: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
  9: { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 },
};

const town = (id, name, ability, firstNight, otherNight) => ({
  id, name, ability, team: "townsfolk", firstNight, otherNight,
});
const out = (id, name, ability, firstNight, otherNight) => ({
  id, name, ability, team: "outsider", firstNight, otherNight,
});
const minion = (id, name, ability, firstNight, otherNight) => ({
  id, name, ability, team: "minion", firstNight, otherNight,
});
const demon = (id, name, ability, firstNight, otherNight) => ({
  id, name, ability, team: "demon", firstNight, otherNight,
});

export const CHARACTER_LIST = [
  town("grandmother", "Grandmother",
    "On the first night, you learn one good player and the role they hold. If the Demon later kills that player, you die too.",
    40, 51),
  town("sailor", "Sailor",
    "Each night, choose a living player. Either you or they are drunk until the next dusk. While this ability works, you cannot die.",
    11, 4),
  town("chambermaid", "Chambermaid",
    "Each night, choose two living players besides yourself. You learn how many of them woke tonight to use their own ability.",
    51, 70),
  town("exorcist", "Exorcist",
    "Each night except the first, choose a player you did not choose last night. If they are the Demon, they learn who you are and do not wake tonight.",
    0, 21),
  town("innkeeper", "Innkeeper",
    "Each night except the first, choose two players. They cannot die tonight, but one of them is drunk until the next dusk.",
    0, 9),
  town("gambler", "Gambler",
    "Each night except the first, choose a player and name a character. If your guess is wrong, you die.",
    0, 10),
  town("gossip", "Gossip",
    "Each day, you may make one public statement. If that statement is true, a player dies tonight.",
    0, 38),
  town("courtier", "Courtier",
    "Once per game, at night, name a character. If that character is in play, they are drunk for three nights and three days.",
    19, 8),
  town("professor", "Professor",
    "Once per game, on a night after the first, choose a dead player. If they are a Townsfolk, they return to life.",
    0, 43),
  town("minstrel", "Minstrel",
    "When a Minion dies by execution, every other player is drunk until dusk tomorrow.",
    0, 0),
  town("tealady", "Tea Lady",
    "If your two living neighbors are both good, those neighbors cannot die.",
    0, 0),
  town("pacifist", "Pacifist",
    "When the town executes a good player, that player might survive anyway.",
    0, 0),
  town("fool", "Fool",
    "The first time you would die, you don't.",
    0, 0),
  out("tinker", "Tinker",
    "You might suddenly die at any moment.",
    0, 49),
  out("moonchild", "Moonchild",
    "When you learn that you have died, publicly choose a living player. If they were good when you chose them, they die on the next night — but only if your ability is working that night.",
    0, 50),
  out("goon", "Goon",
    "Each night, the first player who chooses you with an ability is drunk until dusk, and you become their alignment.",
    0, 0),
  out("lunatic", "Lunatic",
    "You believe you are a Demon, but you are not. The real Demon knows who you are and learns who you choose at night.",
    8, 20),
  minion("godfather", "Godfather",
    "You start knowing which Outsider roles are in play. If exactly one player died during the day, you choose a player to die tonight. Setup has one more or one fewer Outsider than usual.",
    21, 37),
  minion("devilsadvocate", "Devil's Advocate",
    "Each night, choose a living player you did not choose last night. If the town executes them tomorrow, they do not die.",
    22, 13),
  minion("assassin", "Assassin",
    "Once per game, on a night after the first, choose a player. They die, even if something would normally save them.",
    0, 36),
  minion("mastermind", "Mastermind",
    "If the Demon dies by execution and that would end the game, play one more night and one more day. On that last day, executing a good player makes evil win. Executing an evil player, or executing nobody, makes good win.",
    0, 0),
  demon("zombuul", "Zombuul",
    "Each night except the first, if nobody died during the day, choose a player: they die. The first time you would die, you live, but the town treats you as dead.",
    0, 25),
  demon("pukka", "Pukka",
    "Each night, choose a player: they are poisoned. The player you poisoned on the previous night dies and is healthy again.",
    28, 26),
  demon("shabaloth", "Shabaloth",
    "Each night except the first, choose two players: they die. A player you killed on the previous night might come back to life.",
    0, 27),
  demon("po", "Po",
    "Each night except the first, you may choose a player: they die. If you chose nobody last night, you must choose three players tonight.",
    0, 28),
];

export const CHARACTERS = Object.fromEntries(CHARACTER_LIST.map((c) => [c.id, c]));

export const TOWNSFOLK = CHARACTER_LIST.filter((c) => c.team === "townsfolk").map((c) => c.id);
export const OUTSIDERS = CHARACTER_LIST.filter((c) => c.team === "outsider").map((c) => c.id);
export const MINIONS = CHARACTER_LIST.filter((c) => c.team === "minion").map((c) => c.id);
export const DEMONS = CHARACTER_LIST.filter((c) => c.team === "demon").map((c) => c.id);
export const GOOD_ROLES = [...TOWNSFOLK, ...OUTSIDERS];

export function teamOf(roleId) {
  return CHARACTERS[roleId]?.team || null;
}

export function isDemonRole(roleId) {
  return teamOf(roleId) === "demon";
}

export function nightOrder(which) {
  const key = which === "first" ? "firstNight" : "otherNight";
  return CHARACTER_LIST
    .filter((c) => c[key] > 0)
    .sort((a, b) => a[key] - b[key])
    .map((c) => c.id);
}

/** Printed sheet order, plus the dusk briefing where evil (and the Lunatic) learn their team. */
export const FIRST_NIGHT = ["briefing", ...nightOrder("first")];
export const OTHER_NIGHT = nightOrder("other");

export const TEAM_LABEL = {
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
};
