/** Original token drawings. Not the published character art. */

function svg(body) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

const ICONS = {
  grandmother: svg(`<path d="M10 30 L32 12 L54 30" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 30 V50 H48 V30" fill="none" stroke="currentColor" stroke-width="3"/><path d="M28 50 V38 H36 V50" fill="none" stroke="currentColor" stroke-width="3"/>`),
  sailor: svg(`<circle cx="32" cy="18" r="6" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 24 V48 M20 36 H44 M24 48 H40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  chambermaid: svg(`<path d="M22 40 V18 H26 V40 M38 40 V18 H42 V40" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 16 C24 10 28 10 28 16 M40 16 C40 10 44 10 44 16" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 44 H48" stroke="currentColor" stroke-width="3"/>`),
  exorcist: svg(`<path d="M32 10 V22 M24 16 H40" stroke="currentColor" stroke-width="3"/><path d="M22 28 H42 L38 50 H26 Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="38" r="3" fill="currentColor"/>`),
  innkeeper: svg(`<circle cx="32" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 32 V50 M24 42 H32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  gambler: svg(`<rect x="16" y="16" width="32" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="26" cy="26" r="2.5" fill="currentColor"/><circle cx="38" cy="38" r="2.5" fill="currentColor"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/>`),
  gossip: svg(`<path d="M12 16 H44 V40 H28 L18 50 V40 H12 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 26 H34 M22 32 H30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  courtier: svg(`<path d="M22 18 H42 L38 32 C36 40 28 40 26 32 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 42 V52 M24 52 H40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  professor: svg(`<path d="M12 20 H30 V48 H12 Z M34 20 H52 V48 H34 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 20 V48" stroke="currentColor" stroke-width="3"/>`),
  minstrel: svg(`<path d="M24 48 V20 L44 14 V42" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="48" r="6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="40" cy="42" r="6" fill="none" stroke="currentColor" stroke-width="3"/>`),
  tealady: svg(`<path d="M20 24 H40 V36 C40 44 24 44 24 36 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M40 28 H48 V34 H40" fill="none" stroke="currentColor" stroke-width="3"/><path d="M18 50 H46" stroke="currentColor" stroke-width="3"/>`),
  pacifist: svg(`<path d="M32 46 C20 36 12 30 18 22 C22 16 28 20 32 26 C36 20 42 16 46 22 C52 30 44 36 32 46 Z" fill="none" stroke="currentColor" stroke-width="3"/>`),
  fool: svg(`<path d="M18 28 C18 14 46 14 46 28 L42 46 H22 Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="20" r="3" fill="currentColor"/><circle cx="40" cy="20" r="3" fill="currentColor"/><path d="M28 36 H36" stroke="currentColor" stroke-width="3"/>`),
  tinker: svg(`<circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 12 V20 M32 44 V52 M12 32 H20 M44 32 H52 M18 18 L24 24 M40 40 L46 46 M46 18 L40 24 M24 40 L18 46" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  moonchild: svg(`<path d="M36 12 A16 16 0 1 0 36 52 A12 12 0 1 1 36 12 Z" fill="currentColor"/>`),
  goon: svg(`<path d="M16 28 C16 16 48 16 48 28 V40 C48 50 16 50 16 40 Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="26" cy="32" r="3" fill="currentColor"/><circle cx="38" cy="32" r="3" fill="currentColor"/><path d="M26 42 H38" stroke="currentColor" stroke-width="3"/>`),
  lunatic: svg(`<path d="M38 12 A18 18 0 1 0 40 50" fill="none" stroke="currentColor" stroke-width="3"/><path d="M34 24 L42 40" stroke="currentColor" stroke-width="3"/>`),
  godfather: svg(`<circle cx="32" cy="32" r="10" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="32" r="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 14 V8 M32 56 V50" stroke="currentColor" stroke-width="3"/>`),
  devilsadvocate: svg(`<path d="M32 14 V50 M18 50 H46" stroke="currentColor" stroke-width="3"/><path d="M32 22 L16 30 H28 Z M32 22 L48 34 H36 Z" fill="none" stroke="currentColor" stroke-width="3"/>`),
  assassin: svg(`<path d="M32 14 C20 20 16 32 22 42 L32 52 L42 42 C48 32 44 20 32 14 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 24 V36" stroke="currentColor" stroke-width="3"/>`),
  mastermind: svg(`<path d="M20 26 H44 L40 18 H24 Z M18 26 H46 V32 H18 Z M28 32 V48 H36 V32" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 48 H42" stroke="currentColor" stroke-width="3"/>`),
  zombuul: svg(`<path d="M22 16 H42 V28 C46 32 46 40 40 44 V52 H24 V44 C18 40 18 32 22 28 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 24 H40 M24 32 H40 M26 40 H38" stroke="currentColor" stroke-width="2"/>`),
  pukka: svg(`<path d="M14 40 C20 20 28 20 32 32 C36 44 44 44 50 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="22" r="3" fill="currentColor"/>`),
  shabaloth: svg(`<path d="M14 28 C14 16 50 16 50 28 V36 C50 48 14 48 14 36 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 34 L28 40 L32 34 L36 40 L40 34" fill="none" stroke="currentColor" stroke-width="3"/>`),
  po: svg(`<path d="M18 46 L24 18 M32 46 V16 M46 46 L40 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  unknown: svg(`<circle cx="32" cy="32" r="16" fill="none" stroke="currentColor" stroke-width="3"/><path d="M26 26 C26 20 40 20 40 28 C40 34 32 34 32 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="48" r="2" fill="currentColor"/>`),
};

export function tokenIcon(role) {
  return ICONS[role] || ICONS.unknown;
}

export function batSvg() {
  return `<svg class="critter-svg" viewBox="0 0 16 10" aria-hidden="true">
    <rect x="7" y="4" width="2" height="2"/>
    <rect x="6" y="3" width="1" height="1"/><rect x="9" y="3" width="1" height="1"/>
    <rect x="5" y="4" width="1" height="1"/><rect x="10" y="4" width="1" height="1"/>
    <rect x="3" y="3" width="2" height="1"/><rect x="11" y="3" width="2" height="1"/>
    <rect x="2" y="2" width="1" height="1"/><rect x="13" y="2" width="1" height="1"/>
    <rect x="1" y="4" width="2" height="1"/><rect x="13" y="4" width="2" height="1"/>
    <rect x="4" y="5" width="1" height="2"/><rect x="11" y="5" width="1" height="2"/>
  </svg>`;
}

export function ravenSvg() {
  return `<svg class="critter-svg" viewBox="0 0 16 10" aria-hidden="true">
    <rect x="7" y="4" width="4" height="2"/>
    <rect x="11" y="3" width="3" height="1"/>
    <rect x="6" y="3" width="2" height="1"/>
    <rect x="5" y="5" width="3" height="1"/>
    <rect x="8" y="6" width="1" height="2"/>
    <rect x="4" y="2" width="3" height="1"/>
    <rect x="3" y="3" width="2" height="1"/>
  </svg>`;
}
