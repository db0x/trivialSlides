// Slide layouts. One definition, two consumers: the editor builds its
// layout tiles from it (handed into the page as JSON), the renderer picks
// the CSS class with it and decides whether an image element is needed.
//
// Important for the storage format: a layout NEVER changes a slide's
// Markdown text, only its attributes. That keeps the body plain Markdown,
// which a stock reveal.js (or a text editor) still renders sensibly --
// just without the finer points of the arrangement.
//
// The words belong to i18n.js, keyed by id -- layout.<id>.label and
// layout.<id>.hilfe. What stays here is the structure.
//
// felder: which input fields the editor shows for this layout.
//   bild   - image picker (data-image)
//   quelle - attribution below the quote (data-quelle)
//   video  - a YouTube link (data-video, see video.js)
//   textseite - where the text goes in relation to the player
//            (data-textseite, see video.js)
//   textbreite - how wide the text may get beside the picture or the
//            player (data-textbreite, see BREITEN below)
// Every layout has a title and a body, so those are not in the list.
const LAYOUTS = [
  {
    id: "titel",
    felder: [],
  },
  {
    id: "abschnitt",
    felder: [],
  },
  {
    id: "text",
    felder: [],
  },
  {
    id: "spalten",
    felder: [],
  },
  {
    id: "spalten-drei",
    felder: [],
  },
  {
    id: "bild-rechts",
    felder: ["bild", "textbreite"],
    // Half and half, which is what this layout has always looked like.
    breite: "50",
  },
  {
    id: "bild-links",
    felder: ["bild", "textbreite"],
    // Half and half, which is what this layout has always looked like.
    breite: "50",
  },
  {
    id: "bild-voll",
    felder: ["bild"],
  },
  {
    id: "video",
    felder: ["video", "textseite", "textbreite"],
    breite: "33",
  },
  {
    id: "zitat",
    felder: ["quelle"],
  },
];

// How much of the slide the text may take where it stands BESIDE something
// -- a picture or a player. A cap and not a width: a couple of lines do not
// have to fill their share, and what the cap leaves over goes to the other
// side.
//
// Three values and not a free number: what is on offer has to look right
// next to a picture, and a field taking any percentage would mostly offer
// ways to make the slide worse.
//
// Here rather than with the video (video.js), because by now three layouts
// share it and none of them owns it.
//
// The default belongs to the LAYOUT, not to the list: an image layout has
// always split the slide down the middle and a video slide has always given
// the player two thirds. Those are what they look like before anybody
// chooses, so those are their defaults -- a deck written before this
// existed reads exactly as it did. `breite` on a layout below says so; a
// layout that names none falls back to the middle value.
const BREITEN = ["25", "33", "50"];
const BREITE_STANDARD = "33";

function standardBreite(id) {
  return get(id).breite || BREITE_STANDARD;
}

function nurBreite(wert, layoutId) {
  const s = String(wert == null ? "" : wert).trim();
  return BREITEN.includes(s) ? s : standardBreite(layoutId);
}

const DEFAULT_LAYOUT = "text";

const byId = new Map(LAYOUTS.map((l) => [l.id, l]));

// Unknown layout names (hand-written Markdown, an older deck) fall back to
// "text" instead of swallowing the slide.
function get(id) {
  return byId.get(String(id || "")) || byId.get(DEFAULT_LAYOUT);
}

function hatFeld(id, feld) {
  return get(id).felder.includes(feld);
}

module.exports = { LAYOUTS, DEFAULT_LAYOUT, get, hatFeld, BREITEN, BREITE_STANDARD, standardBreite, nurBreite };
