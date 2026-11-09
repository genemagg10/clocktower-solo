const MUTE_KEY = "clocktower-solo-mute";

let ctx = null;
let muted = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  muted = false;
}

function context() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, type, gain, delay = 0) {
  if (muted) return;
  const audio = context();
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.value = 0.0001;
  osc.connect(amp);
  amp.connect(audio.destination);
  const t = audio.currentTime + delay;
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
  if (!muted) blip();
  return muted;
}

export function blip() {
  tone(520, 0.08, "triangle", 0.04);
}

export function nightSound() {
  tone(196, 0.4, "sine", 0.05);
  tone(247, 0.5, "sine", 0.03, 0.08);
}

export function dawnSound() {
  tone(392, 0.18, "triangle", 0.05);
  tone(523, 0.22, "triangle", 0.04, 0.1);
  tone(659, 0.28, "triangle", 0.04, 0.2);
}

export function knock() {
  tone(180, 0.07, "square", 0.03);
}

export function bell() {
  tone(440, 0.45, "sine", 0.05);
  tone(880, 0.35, "sine", 0.02, 0.02);
}

export function winSound(good) {
  if (good) {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.05, i * 0.1));
  } else {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, "sine", 0.05, i * 0.12));
  }
}

export function squeak() {
  tone(880, 0.06, "square", 0.02);
  tone(660, 0.08, "square", 0.02, 0.05);
}
