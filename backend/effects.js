// Animated slide backgrounds. Unlike a gradient these cannot travel in the
// attribute as a value: an animation is a rule with keyframes, not a value,
// so what the file carries is a NAME and the stylesheet carries the effect
// (public/css/slides.css, "Background effects").
//
// That is the same division of labour as the layouts: the .md says what is
// wanted, the CSS says what it looks like -- and an effect can be redrawn
// without touching a single deck.
//
// The list is deliberately not extensible through a file the way the
// gradients are (verlaeufe.js): a new effect needs its own CSS rules, and
// those live in the project, not next to the decks.
//
// The words belong to i18n.js, keyed effekt.<id>.
const EFFEKTE = [
  { id: "waves" },
  { id: "starfield" },
  { id: "blobs" },
];

const ids = new Set(EFFEKTE.map((e) => e.id));

// An unknown name (a hand-written deck, an effect that has since gone)
// becomes "no effect" rather than an attribute nothing answers.
function gibt(id) {
  return ids.has(String(id || ""));
}

function nurEffekt(wert) {
  const s = String(wert == null ? "" : wert).trim();
  return gibt(s) ? s : "";
}

module.exports = { EFFEKTE, gibt, nurEffekt };
