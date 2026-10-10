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
// gradients are (gradients.js): a new effect needs its own CSS rules, and
// those live in the project, not next to the decks.
//
// The words belong to i18n.js, keyed effect.<id>.
//
// `ground` and `over` are what an effect is made of, as far as reading the
// writing on it goes: the colour (or the gradient's stops) that lies under
// everything, and the large shapes that drift across it. An effect brings
// its own ground and covers whatever the slide chose (slides.css, "It
// brings its background with it"), so these are the colours the writing
// will really stand on -- and the editor judges the contrast against the
// worst of them, the way it judges a gradient by its worst stop
// (js/editor/contrast.js).
//
// Only what COVERS AREA belongs here. The starfield's stars are specks a
// letter is never read against; its ground is the night sky and nothing
// else. The stripes, the blobs and the waves' dark shapes are the size of
// the slide and do count.
//
// Written here rather than parsed out of slides.css: the rules there are
// keyframes and composited layers, not values, and the same four colours
// are already kept in step by hand in css/app.css (the sample and the
// tiles) and css/thumb.css. This is the fourth place and the first one
// that is DATA -- the comments in all of them point at each other.
const EFFECTS = [
  { id: "waves", ground: ["#4973ff"], over: ["#141414", "rgba(20, 20, 20, 0.5)"] },
  { id: "starfield", ground: ["#1b2735", "#090a0f"], over: [] },
  { id: "blobs", ground: ["#fee440"], over: ["#9b5de5", "#f15bb5", "#00bbf9", "#00f5d4"] },
  // The stripes are the one effect whose declared ground is never seen.
  // Each of its three layers covers the whole slide -- a hard-edged
  // two-colour gradient, not a shape -- at opacity 0.5, so every point
  // lies under all three and the white underneath only ever shows through
  // at 0.125. What the writing really stands on is therefore a mix:
  // 0.5 of the top layer, 0.25 of the middle, 0.125 of the bottom and
  // 0.125 white. Each layer is green or blue at that point, which gives
  // eight combinations -- but luminance moves one way as a layer swaps
  // from one colour to the other, so all eight lie between the two
  // written here: green everywhere, and blue everywhere.
  { id: "stripes", ground: ["#79d24d", "#20a6ff"], over: [] },
];

const ids = new Set(EFFECTS.map((e) => e.id));

// An unknown name (a hand-written deck, an effect that has since gone)
// becomes "no effect" rather than an attribute nothing answers.
function exists(id) {
  return ids.has(String(id || ""));
}

function onlyEffect(value) {
  const s = String(value == null ? "" : value).trim();
  return exists(s) ? s : "";
}

module.exports = { EFFECTS, exists, onlyEffect };
