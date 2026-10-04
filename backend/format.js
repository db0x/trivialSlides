// What the file format can say, and since when it has been able to.
//
// Two lines in the head of every deck come out of this module:
//
//   generator: trivialSlides
//   min-version: 0.4.0
//
// The first says what the file is. A .md with a `titel:` in its head and
// HTML comments in its slides is not obviously anybody's in particular,
// and this is the one line that answers the question without opening the
// editor.
//
// The second says what it TAKES to read it. Not what wrote it: a deck
// using nothing that was not there at the start says so, however new the
// editor that saved it last. The number is therefore computed from the
// deck itself, out of the table below -- the newest thing the deck
// actually says decides it.
//
// What it is for: this format grows, and an older trivialSlides reading a
// newer deck does not fail -- it quietly drops what it does not know
// (deck.js is forgiving by design, and has to be, for files that come from
// elsewhere). The next save then makes the loss permanent. So the deck
// states its own requirement, the editor compares it against itself, and
// the one case worth a warning gets one.
//
// Adding to the format means adding a line to FEATURES. Leaving it out
// does not break anything -- the deck simply understates what it needs,
// which is the same silence this module exists to end.
const layouts = require("./layouts");
const bands = require("./bands");

// The key the two lines travel under. Hyphenated like the band keys, and
// in English like everything written since the German ids were renamed.
const GENERATOR_KEY = "generator";
const MIN_VERSION_KEY = "min-version";

// What this project calls itself in a file. A constant and not the package
// name: the package is lower-cased in places, the brand is not.
const GENERATOR = "trivialSlides";

// What a deck needs when it says nothing out of the ordinary -- a title,
// a theme, a transition, headings and text. That has been readable since
// the first version, so this is where the counting starts.
const BASE = "0.1.0";

// Since when the format can say what. Every entry is one thing a deck can
// carry and the version that first understood it -- taken from the history
// of this repository, not from memory: the commit that introduced the
// attribute, and the version that commit shipped.
//
// `found` is asked of the whole model, because some of these are a
// property of the deck (the strips) and some of a single slide.
//
// Ordered oldest first, which is also the order they are read in -- the
// answer is the newest one that says yes.
const FEATURES = [
  {
    version: "0.2.1",
    // A YouTube player, a gradient, an animated background, and how wide
    // the text stands beside a picture.
    found: (m) => m.slides.some((s) => s.layout === "video" || s.gradient || s.effect
      || (s.textWidth && s.textWidth !== layouts.defaultWidth(s.layout))
      || (s.textSide && s.textSide !== layouts.defaultSide(s.layout))),
  },
  {
    version: "0.3.1",
    // The QR code, which is a layout and four attributes of its own.
    found: (m) => m.slides.some((s) => s.layout === "qr"),
  },
  {
    version: "0.4.0",
    // Where the heading stands, and columns each holding a text of their
    // own -- the attribute here, the breaks in the body (layouts.js).
    found: (m) => m.slides.some((s) => s.titleAlign || s.columnMode === layouts.COLUMN_SPLIT),
  },
  {
    version: "0.7.1",
    // Where the text box stands on a full-bleed picture, and a text box
    // that waits for a click.
    found: (m) => m.slides.some((s) => s.textFragment
      || (s.textPlace && s.textPlace !== layouts.PLACE_DEFAULT)),
  },
  {
    version: "0.8.0",
    // A group of blocks that appears on one click. It lives in the body
    // rather than in an attribute, so this one is read off the text
    // (render.js holds the other end of the pair).
    found: (m) => m.slides.some((s) => GROUP_LINE.test(String(s.content || ""))),
  },
  {
    version: "0.9.0",
    // The two strips, and the slides that send one of them away.
    found: (m) => bands.BANDS.some((name) => !bands.isEmpty(m[name]))
      || m.slides.some((s) => s.noHeader || s.noFooter),
  },
  {
    // The one entry that is not yet history: this is the version it ships
    // in, taken from package.json at the time of writing. Released under
    // another number, the line follows -- it is a claim about which
    // trivialSlides can read the attribute, not about today.
    version: "0.10.1",
    // How many columns the text runs in. Before this the number WAS the
    // layout ("columns", "columns-three"), and a reader that does not know
    // the attribute puts the whole slide in one column (layouts.js).
    found: (m) => m.slides.some((s) => s.columnCount
      && s.columnCount !== layouts.COLUMN_COUNT_DEFAULT),
  },
  {
    // Same release as the line above, a different thing: a slide whose
    // blocks stand where they were put. A reader that does not know the
    // layout shows them stacked in reading order -- the text is all
    // there, the arrangement is not, which is a loss worth naming.
    version: "0.10.1",
    found: (m) => m.slides.some((s) => s.layout === "freestyle"
      || PLACED.test(String(s.content || ""))),
  },
];

// A block that has been given a place (render.js holds the other end).
// Read off the text, like the group above: it lives in the body, not in
// an attribute of the slide.
const PLACED = /^[ \t]*<!--[ \t]*\.element:[^>]*\bdata-at="/m;

// The opening line of a group, as render.js reads it. Only the shape has
// to match here, not the class inside it: a line that merely looks like
// one is still a line an older reader would show as nothing.
const GROUP_LINE = /^[ \t]*<!--[ \t]*\.group:/m;

// x.y.z -> comparable numbers. Anything that is not a version at all sorts
// before everything, so a head saying "neu" is treated as the oldest
// claim rather than as an obstacle.
function parts(version) {
  const hit = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(version || "").trim());
  return hit ? [+hit[1], +hit[2], +hit[3]] : [0, 0, 0];
}

function isVersion(value) {
  return /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.test(String(value || "").trim());
}

// -1, 0, 1 -- the usual.
function compare(a, b) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

function older(a, b) {
  return compare(a, b) < 0;
}

// The oldest version that reads this deck whole.
function minVersion(model) {
  const deck = model && typeof model === "object" ? model : {};
  const m = { slides: Array.isArray(deck.slides) ? deck.slides : [] };
  bands.BANDS.forEach((name) => { m[name] = deck[name]; });
  return FEATURES.reduce((needed, f) => {
    let hit = false;
    // A feature that throws on a half-built model must not cost the deck
    // its head line: the answer then is simply "this one does not apply".
    try { hit = !!f.found(m); } catch (e) { hit = false; }
    return hit && older(needed, f.version) ? f.version : needed;
  }, BASE);
}

// The two lines, for the head of the file (deck.js, serialize).
function toHead(model) {
  return [`${GENERATOR_KEY}: ${GENERATOR}`, `${MIN_VERSION_KEY}: ${minVersion(model)}`];
}

// What the head says it needs, or "" where it says nothing or nonsense --
// a deck written before this line existed, which is every deck so far.
function fromHead(head) {
  const value = String((head && head[MIN_VERSION_KEY]) || "").trim();
  return isVersion(value) ? value : "";
}

module.exports = {
  GENERATOR, GENERATOR_KEY, MIN_VERSION_KEY, BASE, FEATURES,
  minVersion, toHead, fromHead, isVersion, compare, older,
};
