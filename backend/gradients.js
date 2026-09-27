// Gradient presets for a slide's background. One definition, two consumers:
// the editor builds its swatches from it, and the free CSS field beside them
// accepts anything else the grammar in deck.js allows.
//
// Eight ship with the app. A deck collection extends or replaces them
// without touching the code, through a file next to the decks:
//
//   decks/verlaeufe.json
//   [
//     { "id": "firma",  "name": "Corporate blue",
//       "css": "linear-gradient(180deg, #003057 0%, #0072ce 100%)" },
//     { "id": "nacht",  "name": "Night, but ours",
//       "css": "linear-gradient(180deg, #000000 0%, #202020 100%)" }
//   ]
//
// An entry carrying the id of one of ours REPLACES it -- that is how a
// default is corrected rather than doubled. Everything else is appended in
// the file's order.
//
// The words for our eight live in i18n.js, keyed verlauf.<id>, the way the
// layouts do it. An entry from the file brings its own name: nobody is going
// to translate their own gradient.
const fs = require("fs");
const path = require("path");
const deck = require("./deck");
const { DECKS_DIR } = require("./config");

const DATEI = "verlaeufe.json";

// Built from the same eight tones as the colour picker's swatches
// (js/editor/index.js), so a gradient and a plain colour on neighbouring
// slides still look like one deck.
const STANDARD = [
  { id: "nacht", css: "linear-gradient(180deg, #1b1f23 0%, #0b3d4c 100%)" },
  { id: "tiefsee", css: "linear-gradient(160deg, #0b3d4c 0%, #2b3a55 100%)" },
  { id: "daemmerung", css: "linear-gradient(180deg, #4a3b52 0%, #5c3d2e 100%)" },
  { id: "wald", css: "linear-gradient(200deg, #2f4f3a 0%, #1b1f23 100%)" },
  { id: "spotlicht", css: "radial-gradient(circle at 50% 30%, #2b3a55 0%, #1b1f23 70%)" },
  { id: "morgen", css: "linear-gradient(180deg, #f5f0e6 0%, #ffffff 100%)" },
  { id: "papier", css: "linear-gradient(135deg, #ffffff 0%, #f5f0e6 100%)" },
];

const MAX_EIGENE = 40;

function eineZeile(s, laenge) {
  return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim().slice(0, laenge);
}

// The file is read on every editor load rather than once at startup: it
// lives in the mounted decks folder and is edited while the app runs. Having
// to restart the server to see a new gradient would be a puzzle, not a
// feature -- and it is one small file per opened editor.
function eigene() {
  let roh;
  try {
    roh = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, DATEI), "utf8"));
  } catch (err) {
    // No file at all is the normal case. A broken one is worth a line in
    // the log, but it must not take the editor down with it: the eight
    // defaults still work.
    if (err.code !== "ENOENT") console.error(`${DATEI}: ${err.message}`);
    return [];
  }
  if (!Array.isArray(roh)) {
    console.error(`${DATEI}: expected a list of { id, name, css }`);
    return [];
  }
  return roh
    .map((e) => ({
      // Same strictness as everywhere else: the id reaches the page as an
      // attribute and picks a translation key.
      id: eineZeile(e && e.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
      name: eineZeile(e && e.name, 60),
      css: eineZeile(e && e.css, deck.VERLAUF_MAX),
    }))
    .filter((e) => {
      if (!e.id || !deck.istVerlauf(e.css)) {
        console.error(`${DATEI}: skipping ${e.id || "(no id)"} -- not a usable gradient`);
        return false;
      }
      return true;
    })
    .slice(0, MAX_EIGENE);
}

function liste() {
  const dazu = eigene();
  const ersetzt = new Map(dazu.map((e) => [e.id, e]));
  const unsere = STANDARD.map((v) => ersetzt.get(v.id) || v);
  const neue = dazu.filter((e) => !STANDARD.some((v) => v.id === e.id));
  return unsere.concat(neue);
}

module.exports = { STANDARD, liste, DATEI };
