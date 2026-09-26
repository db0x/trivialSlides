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
    felder: ["bild"],
  },
  {
    id: "bild-links",
    felder: ["bild"],
  },
  {
    id: "bild-voll",
    felder: ["bild"],
  },
  {
    id: "video",
    felder: ["video"],
  },
  {
    id: "zitat",
    felder: ["quelle"],
  },
];

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

module.exports = { LAYOUTS, DEFAULT_LAYOUT, get, hatFeld };
