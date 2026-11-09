import { CHARACTER_LIST, CHARACTERS, TEAM_LABEL, teamOf } from "../engine/characters.js";
import { baseDistribution } from "../engine/setup.js";
import { roleName } from "../engine/setup.js";
import {
  createGame, submit, pump, playUntil, callNominations, sayAloud, whisperTo, resign, summarize,
} from "../engine/game.js";
import { getSelfView, grimoireRows } from "../engine/view.js";
import { declareGossip, offerGossip } from "../engine/day.js";
import { isSociallyAlive, phaseLabel, sociallyAlive, voteThreshold } from "../engine/rules.js";
import { tokenIcon, batSvg, ravenSvg } from "./icons.js";
import * as audio from "./audio.js";

const SAVE_KEY = "clocktower-solo-v1";

let state = null;
let tab = "town";
let draft = "";
let whisperId = "";
let picked = [];
let pickedRole = "";
let toast = "";
let moonTaps = 0;
let guideOpen = false;
let lastSound = "";

const params = new URLSearchParams(location.search);
const previewKind = params.get("preview");
if (params.get("tab")) tab = params.get("tab");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1 || !parsed.players) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist() {
  if (!state || state.preview) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* full or private mode */ }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

function human() {
  return state?.players?.find((p) => p.isHuman) || null;
}

function view() {
  const you = human();
  return you ? getSelfView(state, you.id) : null;
}

function go(next) {
  const previous = lastSound;
  state = next;
  if (state?.pending?.step !== pickedStep) {
    picked = [];
    pickedRole = "";
  }
  persist();
  render();
  const soundKey = `${state?.phase}:${state?.time}:${state?.winner || ""}:${state?.publicLog?.length || 0}`;
  if (soundKey !== previous) {
    if (state?.phase === "night" && previous && !previous.startsWith("night")) audio.nightSound();
    if (state?.phase === "day" && previous && !previous.startsWith("day")) audio.dawnSound();
    if (state?.phase === "end" && state.winner) audio.winSound(state.winner === "good");
    const last = state?.publicLog?.at(-1);
    if (last?.kind === "vote") audio.knock();
    if (last?.text?.includes("does not wake") || last?.text?.includes("dies")) audio.bell();
  }
  lastSound = soundKey;
  if (state?.beat && !state.preview) {
    state.beat = false;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
    setTimeout(() => go(pump(state, {})), delay);
  }
}

let pickedStep = "";
function markPickStep() {
  pickedStep = state?.pending ? `${state.pending.step}:${state.pending.actorId}:${state.time}` : "";
}

function render() {
  const app = document.getElementById("app");
  markPickStep();
  const night = !state || state.phase === "night" || state.phase === "reveal" || state.phase === "setup";
  const skyClass = state && (state.phase === "day" || state.phase === "nominate" || state.phase === "vote" || state.phase === "resolve" || state.phase === "morning" || state.phase === "moonchild")
    ? "day" : "night";
  const showRaven = state && state.time % 4 === 2;
  app.innerHTML = `
    <div class="sky ${state ? skyClass : "night"}">
      <div class="stars"></div>
      <button class="moon" id="moon" type="button" aria-label="The moon"></button>
      <div class="sun" aria-hidden="true"></div>
      <button class="critter" id="critter" type="button" aria-label="${showRaven ? "A raven" : "A bat"}">${showRaven ? ravenSvg() : batSvg()}</button>
      ${screen()}
      ${toast ? `<div class="toast">${escapeHtml(toast)}</div>` : ""}
    </div>
    ${guideOpen ? guideDialog() : ""}
  `;
  bind();
  const say = document.getElementById("say");
  if (say) say.value = draft;
  const log = document.getElementById("log");
  if (log) log.scrollTop = log.scrollHeight;
}

function screen() {
  if (!state) return setupScreen();
  if (state.phase === "end") return grimoireScreen();
  return gameScreen();
}

function setupScreen() {
  const saved = loadSave();
  const count = Number(document.getElementById("count")?.dataset.count || window.__count || 9);
  window.__count = count;
  const dist = baseDistribution(count);
  return `
    <header class="topbar">
      <h1 class="brand">Clocktower Solo<small>Bad Moon Rising</small></h1>
      <div class="spacer"></div>
      <button class="icon-btn" id="mute" type="button">${audio.isMuted() ? "Sound off" : "Sound on"}</button>
      <button class="text-btn" id="guide" type="button">How to play</button>
    </header>
    <main class="setup">
      <p class="meta">A round table. A bad moon. You, and the town.</p>
      <h2 class="hero">Who sits beside you tonight?</h2>
      <p class="lede">One human player, dealt a random seat and a random character — good or evil. Everyone else is a neighbor with a personality, a bluff, and no peek at the grimoire.</p>
      <div class="counts" id="counts">
        ${Array.from({ length: 11 }, (_, i) => i + 5).map((n) => `<button type="button" class="count ${n === count ? "on" : ""}" data-count="${n}">${n}</button>`).join("")}
      </div>
      <p><strong>${count} players</strong> · ${dist.townsfolk} Townsfolk · ${dist.outsiders} Outsiders · ${dist.minions} Minions · ${dist.demons} Demon</p>
      <p class="fine">If a Godfather is dealt, the Outsider count shifts by one. That part stays secret until the end.</p>
      <form id="start-form" class="row">
        <input id="name" name="name" maxlength="16" value="Luca" aria-label="Your name" style="border-radius:12px;border:0;padding:12px;min-height:48px;color:#24160f;background:#f6e6c8">
        <button class="big-btn" type="submit">Deal the tokens</button>
        ${saved ? `<button class="big-btn alt" id="continue" type="button">Continue the tale</button>` : ""}
      </form>
      <p class="fine">An unofficial fan storybook. Not made by or affiliated with The Pandemonium Institute. The words and pictures here are original, written for Luca Maggio.</p>
    </main>`;
}

function gameScreen() {
  const you = view();
  return `
    <header class="topbar">
      <h1 class="brand">Clocktower Solo<small>${escapeHtml(phaseLabel(state))}${state.finalDay ? " · last day" : ""}</small></h1>
      <span class="pill">${escapeHtml(you ? you.shownName : "Spectator")}</span>
      <div class="spacer"></div>
      <button class="icon-btn" id="mute" type="button">${audio.isMuted() ? "Sound off" : "Sound on"}</button>
      <button class="text-btn" id="guide" type="button">Script</button>
      <button class="text-btn" id="resign" type="button">Peek</button>
    </header>
    <nav class="tabs">
      <button type="button" class="text-btn ${tab === "town" ? "on" : ""}" data-tab="town">Town</button>
      <button type="button" class="text-btn ${tab === "talk" ? "on" : ""}" data-tab="talk">Talk</button>
      <button type="button" class="text-btn ${tab === "you" ? "on" : ""}" data-tab="you">You</button>
    </nav>
    <div class="stage">
      <aside class="panel ${tab === "you" ? "active" : ""}" id="you">${youPanel(you)}</aside>
      <div class="town-wrap ${tab === "town" ? "active" : ""}" id="town-panel">
        ${townSquare()}
        ${actionSheet()}
      </div>
      <aside class="panel ${tab === "talk" ? "active" : ""}" id="talk">${talkPanel()}</aside>
    </div>`;
}

function youPanel(you) {
  if (!you) return `<div class="pad"><h2>You</h2><p>The tale is telling itself.</p></div>`;
  const teammates = you.teammates.length
    ? `<p><strong>${you.feelsEvil ? "Your team" : "With you"}:</strong> ${you.teammates.map((c) => `${escapeHtml(c.name)} the ${escapeHtml(c.roleName)}`).join("; ")}</p>`
    : "";
  const bluffs = you.bluffs.length
    ? `<p><strong>Bluffs:</strong> ${you.bluffs.map((b) => escapeHtml(b.name)).join(", ")}</p>`
    : "";
  const hint = you.lunaticHint ? `<p><strong>Lunatic:</strong> ${escapeHtml(you.lunaticHint.name)}</p>` : "";
  const notes = you.notes.length ? `<ul class="note-list">${you.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : `<p class="fine">Your private notes will gather here.</p>`;
  const dead = !you.alive || you.registersDead;
  return `
    <div class="pad">
      <div class="role-card">
        <div class="token ${you.shownTeam} you">${tokenIcon(you.shownRole)}</div>
        <div>
          <div class="meta">${escapeHtml(you.teamLabel)} · ${you.feelsEvil ? "Evil" : "Good"}</div>
          <h2>${escapeHtml(you.shownName)}</h2>
        </div>
      </div>
      <p class="ability">${escapeHtml(you.ability)}</p>
      ${teammates}${bluffs}${hint}
      ${dead ? `<p><strong>${you.registersDead && you.alive ? "The town thinks you are dead. You are not." : "You are dead."}</strong> ${you.ghostVote && dead ? "You still have one ghost vote." : ""}</p>` : ""}
    </div>
    <div class="scroll"><h3>Notes</h3>${notes}</div>`;
}

function townSquare() {
  const n = state.players.length;
  const ballot = state.ballot;
  const currentVoter = ballot ? ballot.order[ballot.index] : null;
  const seats = state.players.map((player) => {
    const angle = (Math.PI * 2 * player.seat) / n - Math.PI / 2;
    const ring = n > 10 ? 40 : 37;
    const x = 50 + ring * Math.cos(angle);
    const y = 50 + ring * Math.sin(angle);
    const claim = [...state.claims].reverse().find((c) => c.speakerId === player.id);
    const shown = player.isHuman ? view().shownRole : (claim?.role || "unknown");
    const team = shown === "unknown" ? "" : teamOf(shown);
    const dead = !isSociallyAlive(player);
    const voted = ballot?.votes?.[player.id];
    const selected = picked.includes(player.id);
    return `<button type="button" class="seat ${dead ? "dead" : ""} ${selected ? "picked" : ""} ${player.id === currentVoter ? "pulse" : ""}" style="--x:${x}%;--y:${y}%" data-seat="${player.id}" aria-label="${escapeHtml(player.name)}">
      <span class="token ${team}">${tokenIcon(shown)}${dead ? `<span class="shroud"></span>` : ""}${voted ? `<span class="hand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 12V7a1.5 1.5 0 0 1 3 0v4M11 11V5.5a1.5 1.5 0 0 1 3 0V12M14 11V7a1.5 1.5 0 0 1 3 0v6c0 3-2 6-6 6h-1c-3 0-5-2-5-5v-3a1.5 1.5 0 0 1 3 0" fill="none" stroke="#3b2418" stroke-width="1.7" stroke-linecap="round"/></svg></span>` : ""}</span>
      <span class="who">${escapeHtml(player.name)}${player.isHuman ? " · you" : ""}</span>
    </button>`;
  }).join("");
  return `<div class="town ${n > 10 ? "crowd" : ""}" id="town">${seats}<div class="town-ring"></div>${centerPiece(currentVoter)}</div>`;
}

function centerPiece(currentVoter) {
  if (state.ballot) {
    const yes = Object.values(state.ballot.votes).filter(Boolean).length;
    const need = voteThreshold(state);
    const voter = state.players.find((p) => p.id === currentVoter);
    const n = state.players.length;
    const seat = voter ? voter.seat : 0;
    const deg = (seat / n) * 360;
    return `<div class="centerpiece"><div class="clock"><div class="clock-hand" style="transform: translate(-50%, -100%) rotate(${deg}deg)"></div><div class="tally">${yes} / ${need}<br>${voter ? escapeHtml(voter.name) : ""}</div></div></div>`;
  }
  const label = phaseLabel(state);
  const moon = state.phase === "night" || state.phase === "reveal" ? `<div class="mini-moon"></div>` : "";
  return `<div class="centerpiece">${moon}<div class="center-label">${escapeHtml(label)}</div></div>`;
}

function actionSheet() {
  const you = human();
  const pending = state.pending;
  const yours = pending && you && pending.actorId === you.id;
  if (state.phase === "reveal" || (pending?.kind === "reveal")) {
    const card = view();
    return `<section class="sheet"><h3>A token in your hand</h3><p>${escapeHtml(pending?.text || "")}</p>
      <div class="role-card"><div class="token ${card.shownTeam}">${tokenIcon(card.shownRole)}</div><strong>${escapeHtml(card.shownName)}</strong></div>
      <div class="row" style="margin-top:10px"><button class="big-btn" id="ack" type="button">I'm ready for night</button></div></section>`;
  }
  if (yours && (pending.kind === "ack" || pending.step === "info")) {
    return `<section class="sheet"><h3>${escapeHtml(pending.title || "The storyteller")}</h3><p>${escapeHtml(pending.text || "")}</p>
      <button class="big-btn" id="ack" type="button">Close your eyes</button></section>`;
  }
  if (yours && pending.kind === "players") return playerSheet(pending);
  if (yours && pending.kind === "gambler") return gamblerSheet(pending);
  if (yours && pending.kind === "role") return roleSheet(pending);
  if (yours && pending.kind === "nominate") return nominateSheet(pending);
  if (yours && pending.kind === "vote") return voteSheet(pending);
  if (yours && pending.kind === "moonchild") return moonSheet(pending);
  if (state.phase === "day") return daySheet();
  if (state.ballot && !yours) {
    const nominee = state.players.find((p) => p.id === state.ballot.nomineeId);
    return `<section class="sheet"><h3>The clock is turning</h3><p>Hands are going up for ${escapeHtml(nominee?.name || "someone")}.</p></section>`;
  }
  if (state.phase === "night") return `<section class="sheet"><h3>The town sleeps</h3><p>Listen. Someone else is awake.</p></section>`;
  return `<section class="sheet"><h3>${escapeHtml(phaseLabel(state))}</h3><p>The square murmurs.</p></section>`;
}

function playerSheet(pending) {
  const names = picked.map((id) => state.players.find((p) => p.id === id)?.name).filter(Boolean);
  return `<section class="sheet"><h3>${escapeHtml(pending.title)}</h3><p>${escapeHtml(pending.text)}</p>
    <p><strong>Chosen:</strong> ${names.length ? escapeHtml(names.join(", ")) : "tap seats in the circle"}</p>
    <div class="row">
      <button class="big-btn" id="confirm-players" type="button" ${picked.length >= pending.min && picked.length <= pending.max ? "" : "disabled"}>Confirm</button>
      ${pending.allowPass ? `<button class="text-btn" id="pass" type="button">Wait</button>` : ""}
      ${pending.allowZero ? `<button class="text-btn" id="zero" type="button">Choose nobody</button>` : ""}
    </div></section>`;
}

function gamblerSheet(pending) {
  const who = picked[0] != null ? state.players.find((p) => p.id === picked[0]) : null;
  return `<section class="sheet"><h3>Gambler</h3><p>${escapeHtml(pending.text)}</p>
    <p><strong>Player:</strong> ${who ? escapeHtml(who.name) : "tap a seat"}</p>
    <div class="choices">${CHARACTER_LIST.map((c) => `<button type="button" class="choice ${pickedRole === c.id ? "on" : ""}" data-role="${c.id}">${escapeHtml(c.name)}</button>`).join("")}</div>
    <button class="big-btn" id="confirm-gamble" type="button" ${who && pickedRole ? "" : "disabled"}>Place the bet</button></section>`;
}

function roleSheet(pending) {
  return `<section class="sheet"><h3>${escapeHtml(pending.title)}</h3><p>${escapeHtml(pending.text)}</p>
    <div class="choices">${(pending.options || []).map((id) => `<button type="button" class="choice ${pickedRole === id ? "on" : ""}" data-role="${id}">${escapeHtml(roleName(id))}</button>`).join("")}</div>
    <div class="row"><button class="big-btn" id="confirm-role" type="button" ${pickedRole ? "" : "disabled"}>Name them</button>
    ${pending.allowPass ? `<button class="text-btn" id="pass" type="button">Not tonight</button>` : ""}</div></section>`;
}

function nominateSheet(pending) {
  const who = picked[0] != null ? state.players.find((p) => p.id === picked[0]) : null;
  return `<section class="sheet"><h3>Your nomination</h3><p>${escapeHtml(pending.text)}</p>
    <p><strong>${who ? escapeHtml(who.name) : "Tap a player, or pass."}</strong></p>
    <div class="row"><button class="big-btn" id="confirm-nom" type="button" ${who ? "" : "disabled"}>Nominate</button>
    <button class="text-btn" id="pass" type="button">Pass</button></div></section>`;
}

function voteSheet(pending) {
  const nominee = state.players.find((p) => p.id === pending.nomineeId);
  return `<section class="sheet"><h3>${escapeHtml(pending.title)}</h3><p>${escapeHtml(pending.text)}</p>
    <div class="row">
      <button class="big-btn evil" id="vote-yes" type="button">Raise hand</button>
      <button class="big-btn" id="vote-no" type="button">Keep it down</button>
    </div></section>`;
}

function moonSheet(pending) {
  const who = picked[0] != null ? state.players.find((p) => p.id === picked[0]) : null;
  return `<section class="sheet"><h3>Point</h3><p>${escapeHtml(pending.text)} The whole square will see.</p>
    <p><strong>${who ? escapeHtml(who.name) : "Tap a living player."}</strong></p>
    <button class="big-btn" id="confirm-moon" type="button" ${who ? "" : "disabled"}>Point</button></section>`;
}

function daySheet() {
  const you = human();
  const gossip = you && offerGossip(state, state.players.find((p) => p.id === you.id));
  return `<section class="sheet"><h3>Day in the square</h3>
    <p>Talk, whisper, then call for nominations when the town is ready.${state.finalDay ? " Something about today feels final." : ""}</p>
    <div class="row"><button class="big-btn" id="nominations" type="button">Open nominations</button>
    ${gossip ? `<button class="text-btn" id="gossip-open" type="button">Make a statement</button>` : ""}</div>
    ${gossip && window.__gossip ? gossipBuilder(you) : ""}
  </section>`;
}

function gossipBuilder(you) {
  const target = picked[0] != null ? state.players.find((p) => p.id === picked[0]) : null;
  return `<div style="margin-top:8px">
    <p><strong>${target ? escapeHtml(target.name) : "Tap who the statement is about."}</strong></p>
    <div class="choices">
      ${["good", "evil", "townsfolk", "outsider", "minion", "demon"].map((type) => `<button type="button" class="choice ${pickedRole === type ? "on" : ""}" data-gtype="${type}">is ${type}</button>`).join("")}
    </div>
    <button class="big-btn" id="gossip-say" type="button" ${target && pickedRole ? "" : "disabled"}>Say it aloud</button>
  </div>`;
}

function talkPanel() {
  const you = human();
  const lines = state.publicLog.filter((line) => {
    if (line.kind !== "whisper") return true;
    return line.speakerId === you?.id || line.toId === you?.id;
  });
  const bubbles = lines.slice(-80).map((line) => {
    const speaker = state.players.find((p) => p.id === line.speakerId);
    const name = line.kind === "story" ? "Storyteller" : (speaker?.name || "");
    return `<div class="bubble ${line.kind || "chat"}">${name ? `<div class="name">${escapeHtml(name)}${line.kind === "whisper" ? " · whisper" : ""}</div>` : ""}<div>${escapeHtml(line.text)}</div></div>`;
  }).join("");
  const targets = state.players.filter((p) => !p.isHuman);
  return `
    <div class="pad"><h2>The square</h2></div>
    <div class="scroll log" id="log">${bubbles || `<div class="bubble story">The square is quiet.</div>`}</div>
    <form class="composer" id="composer">
      <select id="whisper" aria-label="Who hears you">
        <option value="">Everyone</option>
        ${targets.map((p) => `<option value="${p.id}" ${String(whisperId) === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <input id="say" maxlength="240" placeholder="${you ? "Say something" : ""}" aria-label="Message">
      <button class="big-btn" type="submit">Send</button>
    </form>`;
}

function grimoireScreen() {
  const rows = grimoireRows(state);
  const bannerClass = state.winner === "good" ? "good" : state.winner === "evil" ? "evil" : "";
  return `
    <header class="topbar">
      <h1 class="brand">The grimoire<small>Every secret, at last</small></h1>
      <div class="spacer"></div>
      <button class="icon-btn" id="mute" type="button">${audio.isMuted() ? "Sound off" : "Sound on"}</button>
    </header>
    <main class="grimoire">
      <div class="banner ${bannerClass}">
        <h2>${state.winner === "good" ? "Good wins" : state.winner === "evil" ? "Evil wins" : "The tale stops"}</h2>
        <p>${escapeHtml(state.winReason || "The book is open.")}</p>
        <p class="fine">Tale number ${state.seed}</p>
      </div>
      <div class="grim-grid">
        ${rows.map((row) => {
          const nights = (state.timeline || []).flatMap((frame) => {
            const hit = frame.impaired?.find((item) => item.id === row.id);
            return hit ? [`${frame.label}: ${hit.reasons.join(", ")}`] : [];
          });
          return `<article class="grim-card">
            <div class="role-card">
              <div class="token ${row.team}">${tokenIcon(row.role)}</div>
              <div>
                <div class="meta">${escapeHtml(row.name)} · seat ${row.seat + 1}${row.isHuman ? " · you" : ""}</div>
                <h3>${escapeHtml(row.roleName)}</h3>
                <div>${row.alignment} · ${row.alive ? (row.registersDead ? "alive, shrouded" : "alive") : "dead"}</div>
                ${row.perceivedRole ? `<div>Believed they were the ${escapeHtml(roleName(row.perceivedRole))}</div>` : ""}
              </div>
            </div>
            ${nights.length ? `<p class="fine">${nights.map(escapeHtml).join("<br>")}</p>` : `<p class="fine">No drunkenness or poison recorded on the night list.</p>`}
          </article>`;
        }).join("")}
      </div>
      <h2>Night by night</h2>
      ${(state.timeline || []).map((frame) => `<article class="grim-card"><h3>${escapeHtml(frame.label)}</h3><ul>${(frame.events || []).map((event) => `<li>${escapeHtml(event)}</li>`).join("") || "<li>Quiet.</li>"}</ul></article>`).join("")}
      <div class="row" style="margin-top:16px"><button class="big-btn" id="again" type="button">Another night</button></div>
    </main>`;
}

function guideDialog() {
  return `<dialog open><div class="pad">
    <h2>How the night works</h2>
    <p>Good wins by executing the Demon. Evil wins if only two players are still alive and the Demon is one of them. At night, some characters wake. By day, the town talks, nominates, and votes. A nominee needs at least half the living players, rounded up. A later nominee must beat that tally. Dead players stay at the table and may vote once.</p>
    <p>If you are dealt the Lunatic, the game will not tell you. You will see a Demon. The truth waits in the grimoire.</p>
    <div class="filters">
      ${["all", "townsfolk", "outsider", "minion", "demon"].map((team) => `<button type="button" class="choice ${window.__team === team || (!window.__team && team === "all") ? "on" : ""}" data-team="${team}">${team === "all" ? "All" : TEAM_LABEL[team]}</button>`).join("")}
    </div>
    <div class="card-grid">
      ${CHARACTER_LIST.filter((c) => !window.__team || window.__team === "all" || c.team === window.__team).map((c) => `<article class="char-card"><div class="role-card"><div class="token ${c.team}">${tokenIcon(c.id)}</div><div><div class="meta">${TEAM_LABEL[c.team]}</div><strong>${escapeHtml(c.name)}</strong></div></div><p>${escapeHtml(c.ability)}</p></article>`).join("")}
    </div>
    <p class="fine">Written for Luca Maggio, who already knows which Demon forgot to kill. Ability text and drawings in this fan game are original.</p>
    <button class="big-btn" id="close-guide" type="button">Back to the square</button>
  </div></dialog>`;
}

function bind() {
  document.getElementById("mute")?.addEventListener("click", () => { audio.toggleMute(); render(); });
  document.getElementById("guide")?.addEventListener("click", () => { guideOpen = true; render(); });
  document.getElementById("close-guide")?.addEventListener("click", () => { guideOpen = false; render(); });
  document.querySelectorAll("[data-team]").forEach((btn) => btn.addEventListener("click", () => {
    window.__team = btn.dataset.team;
    render();
  }));
  document.getElementById("moon")?.addEventListener("click", () => {
    moonTaps += 1;
    audio.blip();
    if (moonTaps === 5) {
      toast = "The moon winks. For Luca, always.";
      moonTaps = 0;
      render();
      setTimeout(() => { toast = ""; render(); }, 2400);
    }
  });
  document.getElementById("critter")?.addEventListener("click", () => {
    audio.squeak();
    toast = "A little creature wheels overhead, entirely too pleased with itself.";
    render();
    setTimeout(() => { toast = ""; render(); }, 2200);
  });
  document.querySelectorAll("[data-count]").forEach((btn) => btn.addEventListener("click", () => {
    window.__count = Number(btn.dataset.count);
    audio.blip();
    render();
  }));
  document.getElementById("start-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("name").value || "Luca";
    const playerCount = window.__count || 9;
    audio.blip();
    go(createGame({ playerCount, humanName: name, seed: Math.floor(Math.random() * 999983) }));
  });
  document.getElementById("continue")?.addEventListener("click", () => {
    const saved = loadSave();
    if (saved) go(saved);
  });
  document.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => {
    tab = btn.dataset.tab;
    render();
  }));
  document.querySelectorAll("[data-seat]").forEach((btn) => btn.addEventListener("click", () => onSeat(Number(btn.dataset.seat))));
  document.getElementById("ack")?.addEventListener("click", () => { audio.blip(); go(submit(state, { ok: true })); });
  document.getElementById("confirm-players")?.addEventListener("click", () => go(submit(state, { ids: picked.slice() })));
  document.getElementById("zero")?.addEventListener("click", () => go(submit(state, { ids: [] })));
  document.getElementById("pass")?.addEventListener("click", () => go(submit(state, { pass: true })));
  document.getElementById("confirm-gamble")?.addEventListener("click", () => go(submit(state, { id: picked[0], role: pickedRole })));
  document.getElementById("confirm-role")?.addEventListener("click", () => go(submit(state, { role: pickedRole })));
  document.getElementById("confirm-nom")?.addEventListener("click", () => go(submit(state, { nomineeId: picked[0] })));
  document.getElementById("confirm-moon")?.addEventListener("click", () => go(submit(state, { id: picked[0] })));
  document.getElementById("vote-yes")?.addEventListener("click", () => { audio.knock(); go(submit(state, { yes: true })); });
  document.getElementById("vote-no")?.addEventListener("click", () => go(submit(state, { yes: false })));
  document.getElementById("nominations")?.addEventListener("click", () => { audio.blip(); go(callNominations(state)); });
  document.getElementById("gossip-open")?.addEventListener("click", () => { window.__gossip = true; render(); });
  document.getElementById("gossip-say")?.addEventListener("click", () => {
    const you = human();
    declareGossip(state, state.players.find((p) => p.id === you.id), { type: pickedRole, targetId: picked[0] });
    window.__gossip = false;
    picked = [];
    pickedRole = "";
    go(state);
  });
  document.querySelectorAll("[data-role]").forEach((btn) => btn.addEventListener("click", () => {
    pickedRole = btn.dataset.role;
    render();
  }));
  document.querySelectorAll("[data-gtype]").forEach((btn) => btn.addEventListener("click", () => {
    pickedRole = btn.dataset.gtype;
    render();
  }));
  document.getElementById("resign")?.addEventListener("click", () => {
    if (confirm("Open the grimoire and end this tale?")) go(resign(state));
  });
  document.getElementById("again")?.addEventListener("click", () => {
    clearSave();
    state = null;
    render();
  });
  const composer = document.getElementById("composer");
  composer?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = draft.trim();
    draft = "";
    if (!text || !human()) return;
    if (text.toLowerCase().includes("raven")) {
      toast = "Nevermore? Too gloomy. How about never-bored.";
    }
    const target = document.getElementById("whisper")?.value;
    if (target) whisperTo(state, Number(target), text);
    else sayAloud(state, text);
    go(state);
  });
  document.getElementById("say")?.addEventListener("input", (event) => { draft = event.target.value; });
  document.getElementById("whisper")?.addEventListener("change", (event) => { whisperId = event.target.value; });
}

function onSeat(id) {
  const pending = state?.pending;
  const you = human();
  if (!pending || !you || pending.actorId !== you.id) return;
  const options = pending.options || pending.playerOptions || [];
  if (pending.kind === "players" || pending.kind === "nominate" || pending.kind === "moonchild" || pending.kind === "gambler" || window.__gossip) {
    if (pending.kind === "players" && !options.includes(id)) return;
    if ((pending.kind === "nominate" || pending.kind === "moonchild") && options.length && !options.includes(id)) return;
    if (pending.kind === "players" && pending.max > 1) {
      if (picked.includes(id)) picked = picked.filter((n) => n !== id);
      else if (picked.length < pending.max) picked = [...picked, id];
    } else picked = [id];
    audio.blip();
    render();
  }
}

function bootPreview(kind) {
  if (kind === "night") {
    const next = createGame({ playerCount: 9, seed: 4, humanName: "Luca", humanRole: "pukka" });
    next.preview = true;
    return submit(next, { ok: true });
  }
  if (kind === "day") {
    const next = createGame({ playerCount: 9, seed: 6, humanName: "Luca" });
    playUntil(next, (s) => s.phase === "day" && s.time >= 3, { autoHuman: true });
    next.preview = true;
    next.beat = false;
    return next;
  }
  if (kind === "vote") {
    let next = null;
    for (const seed of [6, 2, 9, 4, 11, 15, 3, 12, 18, 21]) {
      next = createGame({ playerCount: 10, seed, humanName: "Luca" });
      playUntil(next, (s) => {
        if (s.phase === "end" || s.time > 10) return true;
        if (!s.ballot) return false;
        const yes = Object.values(s.ballot.votes).filter(Boolean).length;
        return yes >= 1 && s.ballot.index >= 2;
      }, { autoHuman: true });
      const yes = next.ballot ? Object.values(next.ballot.votes).filter(Boolean).length : 0;
      if (yes >= 1) break;
    }
    next.preview = true;
    next.beat = false;
    return next;
  }
  const next = createGame({ playerCount: 9, seed: 4, humanName: "Luca", humanSeat: 2 });
  pump(next, { auto: true, autoHuman: true });
  next.preview = true;
  return next;
}

if (previewKind) {
  state = bootPreview(previewKind);
  render();
} else {
  render();
}

window.__CLOCKTOWER__ = { summarize: () => state && summarize(state), state: () => state };
