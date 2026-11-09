/** Seeded generator so tales can be saved, restored, and replayed. */

export function initRng(seed) {
  let s = Number(seed) >>> 0;
  if (!s) s = 1;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return s || 1;
}

export function nextRand(state) {
  let s = state.rngState >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  if (s === 0) s = 1;
  state.rngState = s;
  return s / 4294967296;
}

export function randInt(state, n) {
  if (n <= 1) return 0;
  return Math.floor(nextRand(state) * n);
}

export function shuffle(state, list) {
  const a = Array.isArray(list) ? [...list] : [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    const swap = a[i];
    a[i] = a[j];
    a[j] = swap;
  }
  return a;
}

export function pick(state, list) {
  return list[randInt(state, list.length)];
}
