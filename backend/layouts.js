// Slide layouts. One definition, two consumers: the editor builds its
// layout tiles from it (handed into the page as JSON), the renderer picks
// the CSS class with it and decides whether an image element is needed.
//
// Important for the storage format: a layout NEVER changes a slide's
// Markdown text, only its attributes. That keeps the body plain Markdown,
// which a stock reveal.js (or a text editor) quiet renders sensibly --
// just without the finer points of the arrangement.
//
// The words belong to i18n.js, keyed by id -- layout.<id>.label and
// layout.<id>.hint. What stays here is the structure.
//
// fields: which input fields the editor shows for this layout.
//   image   - image picker (data-image)
//   source - attribution below the quote (data-quelle)
//   video  - a YouTube link (data-video, see video.js)
//   textSide - where the text goes in relation to the player
//            (data-textseite, see video.js)
//   textWidth - how wide the text may get beside the picture or the
//            player (data-textbreite, see WIDTHS below)
// Every layout has a title and a body, so those are not in the list.
const LAYOUTS = [
  {
    id: "titel",
    fields: [],
  },
  {
    id: "abschnitt",
    fields: [],
  },
  {
    id: "text",
    fields: [],
  },
  {
    id: "spalten",
    fields: [],
  },
  {
    id: "spalten-drei",
    fields: [],
  },
  {
    id: "bild-rechts",
    fields: ["image", "textWidth"],
    // Half and half, which is what this layout has always looked like.
    width: "50",
  },
  {
    id: "bild-links",
    fields: ["image", "textWidth"],
    // Half and half, which is what this layout has always looked like.
    width: "50",
  },
  {
    id: "bild-voll",
    fields: ["image"],
  },
  {
    id: "video",
    fields: ["video", "textSide", "textWidth"],
    width: "33",
  },
  {
    // A code somebody in the room can point a phone at -- the address to
    // the talk, the repository, the author. Built like the video layout,
    // only with a picture the server draws instead of a player it embeds
    // (qr.js).
    id: "qr",
    fields: ["url", "textSide", "textWidth", "qrColor", "qrBackground", "qrTextColor"],
    // Beside the text, not under it: a code is something to scan while the
    // slide is being talked about, and it is square -- across the full
    // width it would take half the slide and say nothing more.
    side: "rechts",
    width: "50",
  },
  {
    id: "zitat",
    fields: ["source"],
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
// existed reads exactly as it did. `width` on a layout below says so; a
// layout that names none falls back to the middle value.
// Where the text sits in relation to what the slide is built around -- a
// player, a code. The arrangement itself is in slides.css; what is decided
// here is which names a file may carry.
//
// Like the width below, the default belongs to the LAYOUT: a video slide
// has always had its text above the player, and a QR code is meant to
// stand beside the text rather than under it. `side` on a layout says so;
// a layout that names none gets the first value.
const SIDES = ["oben", "unten", "links", "rechts"];
const SIDE_DEFAULT = "oben";

function defaultSide(id) {
  return get(id).side || SIDE_DEFAULT;
}

function onlySide(value, layoutId) {
  const s = String(value == null ? "" : value).trim();
  return SIDES.includes(s) ? s : defaultSide(layoutId);
}

const WIDTHS = ["25", "33", "50"];
const WIDTH_DEFAULT = "33";

function defaultWidth(id) {
  return get(id).width || WIDTH_DEFAULT;
}

function onlyWidth(value, layoutId) {
  const s = String(value == null ? "" : value).trim();
  return WIDTHS.includes(s) ? s : defaultWidth(layoutId);
}

const DEFAULT_LAYOUT = "text";

const byId = new Map(LAYOUTS.map((l) => [l.id, l]));

// Unknown layout names (hand-written Markdown, an older deck) fall back to
// "text" instead of swallowing the slide.
function get(id) {
  return byId.get(String(id || "")) || byId.get(DEFAULT_LAYOUT);
}

function hasField(id, field) {
  return get(id).fields.includes(field);
}

module.exports = { LAYOUTS, DEFAULT_LAYOUT, get, hasField,
  SIDES, SIDE_DEFAULT, defaultSide, onlySide,
  WIDTHS, WIDTH_DEFAULT, defaultWidth, onlyWidth };
